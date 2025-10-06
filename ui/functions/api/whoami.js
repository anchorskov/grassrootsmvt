import { handleOptions, getCorsHeaders, isAllowedOrigin } from '../_utils/cors.js';
import { verifyAccessJWT } from '../_utils/verifyAccessJWT.js';

export async function onRequestOptions(context) {
  return handleOptions(context.request);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const origin = request.headers.get('Origin') || '';

  if (!isAllowedOrigin(origin)) {
    return new Response('Forbidden: Origin not allowed', { status: 403 });
  }

  try {
    const payload = await verifyAccessJWT(request, env);
    return new Response(JSON.stringify({ ok: true, email: payload.email }), {
      headers: {
        ...getCorsHeaders(origin),
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Not signed in', message: error.message }), {
      status: 401,
      headers: {
        ...getCorsHeaders(origin),
        'Content-Type': 'application/json',
      },
    });
  }
}
import { getCorsHeaders } from './_utils/cors.js';
import { verifyAccessJWT } from './_utils/verifyAccessJWT.js';

export default async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(env) });
  }

  const verification = await verifyAccessJWT(request, env);
  if (!verification.valid) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(env) }
    });
  }

  return new Response(JSON.stringify({ ok: true, user: verification.user }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(env) }
  });
}
// ui/functions/api/whoami.js
import { createRemoteJWKSet, jwtVerify } from "jose";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "https://volunteers.grassrootsmvt.org",
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": "content-type, cf-access-jwt-assertion, cf-access-token, cf-access-client-id, cf-access-client-secret, authorization",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    },
  });
}

function getCookie(header, name) {
  const m = (header || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export const onRequestOptions = () => json({ ok: true });

export const onRequestGet = async ({ request, env }) => {
  const debug = new URL(request.url).searchParams.get("debug") === "1";

  // Ensure we always log an entry so `wrangler pages deployment tail` can
  // observe the function being invoked. Keep logs minimal in non-debug mode.
  try {
    if (debug) {
      const h = {};
      for (const [k, v] of request.headers) h[k] = v;
      console.log("whoami: start", { url: request.url, debug: true, headers: h });
    } else {
      console.log("whoami: start", { url: request.url, debug: false });
    }
  } catch (e) {
    // logging must not break the handler
    console.error("whoami: log-failed", String(e));
  }

  try {
    // 1) Fast path: header set by Access (not always present)
    const cfEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
    if (cfEmail) {
      return json(debug ? { email: cfEmail, via: "cf-header" } : { email: cfEmail });
    }

    // 2) Extract JWT from header, cf-access-token header, or cookie
    const hdrJwt = request.headers.get("Cf-Access-Jwt-Assertion");
    const cfAccessTokenHeader = request.headers.get("Cf-Access-Token");
    const cookieJwt = getCookie(request.headers.get("Cookie"), "CF_Authorization");

    // Normalize tokens (strip optional "Bearer " prefix)
    const normalizeJwt = (t) => {
      if (!t) return null;
      return t.startsWith("Bearer ") ? t.slice(7).trim() : t;
    };

    const jwt = normalizeJwt(hdrJwt) || normalizeJwt(cfAccessTokenHeader) || cookieJwt;

    // If debug, gather headers and try fetching Cloudflare's get-identity to show
    // what the edge is actually returning for this request. This will include
    // sensitive values (cookie/jwt) so only use in a controlled debug session.
    if (debug) {
      const headersObj = {};
      for (const [k, v] of request.headers) headersObj[k] = v;

      let getIdentity = null;
      try {
        // Prefer fetching identity from the team's cloudflareaccess.com domain
        // when available; fall back to the request origin otherwise. Include
        // the CF_Authorization cookie (or cf-access-token header value) when
        // present so the edge can return the expanded identity object.
        const team = env.CF_ACCESS_TEAM;
        const getIdentityHost = team ? `${team}.cloudflareaccess.com` : new URL(request.url).host;
        const getIdentityUrl = `https://${getIdentityHost}/cdn-cgi/access/get-identity`;
        const cookieForFetch = cookieJwt || cfAccessTokenHeader || null;

        const gidResp = await fetch(getIdentityUrl, {
          headers: cookieForFetch ? { Cookie: `CF_Authorization=${cookieForFetch}` } : {},
        });
        try {
          getIdentity = await gidResp.json();
        } catch (e) {
          getIdentity = { status: gidResp.status, statusText: gidResp.statusText };
        }
      } catch (e) {
        getIdentity = { error: String(e) };
      }

      return json({
        debug: true,
        headers: headersObj,
        hdrJwt: hdrJwt || null,
        cookieJwt: cookieJwt ? "<present>" : null,
        getIdentity,
      });
    }

    if (!jwt) {
      return json({ error: "no-jwt", detail: "No Access header/cookie found" }, 401);
    }

    // 3) Verify with jose
    const aud = env.CF_ACCESS_AUD; // AUD from Access app page

    // Support either a full TEAM_DOMAIN env (including scheme) or a short
    // team name. Preference order:
    //  - CF_ACCESS_TEAM_DOMAIN (e.g. https://skovgard.cloudflareaccess.com)
    //  - CF_ACCESS_TEAM (e.g. skovgard) -> converted to https://<team>.cloudflareaccess.com
    // This mirrors Cloudflare docs that reference TEAM_DOMAIN and AUD.
    let teamDomain = env.CF_ACCESS_TEAM_DOMAIN || null;
    if (!teamDomain && env.CF_ACCESS_TEAM) {
      teamDomain = `https://${env.CF_ACCESS_TEAM}.cloudflareaccess.com`;
    }

    if (!teamDomain || !aud) {
      return json({ error: "missing-env", have_team_domain: !!teamDomain, have_aud: !!aud }, 500);
    }

    const JWKS = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    const verifyOpts = { audience: aud };
    // Optionally enforce issuer if configured. Set CF_ACCESS_ENFORCE_ISSUER=1
    // to require the default issuer, or set CF_ACCESS_ISSUER to a custom
    // issuer URL to enforce it explicitly.
    if (env.CF_ACCESS_ENFORCE_ISSUER === "1") {
      verifyOpts.issuer = teamDomain;
    }
    if (env.CF_ACCESS_ISSUER) {
      verifyOpts.issuer = env.CF_ACCESS_ISSUER;
    }

    const { payload, protectedHeader } = await jwtVerify(jwt, JWKS, verifyOpts);

    const email = payload.email || request.headers.get("Cf-Access-Authenticated-User-Email") || null;

    if (!email) return json({ error: "no-email-claim" }, 401);

    const result = debug
      ? { email, via: hdrJwt ? "header-jwt" : "cookie-jwt", kid: protectedHeader?.kid || null }
      : { email };

    if (debug) console.log("whoami: result", result);
    return json(result);
  } catch (err) {
    console.error("whoami: error", String(err));
    return json({ error: "invalid-token", message: String(err?.message || err) }, 401);
  }
};
