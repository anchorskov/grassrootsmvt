// /functions/whoami.js (Pages Functions)
import { createRemoteJWKSet, jwtVerify } from "jose";
import { requireUserOrThrow } from '../_auth.js';

export const onRequestGet = async ({ request, env }) => {
  // 1) Fast path: Cloudflare already puts email on proxied requests
  const cfEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (cfEmail) {
    return json({ email: cfEmail });
  }

  // 2) Pull JWT from header or cookie
  const jwt =
    request.headers.get("Cf-Access-Jwt-Assertion") ||
    getCookie(request.headers.get("Cookie") || "", "CF_Authorization");

  try {
    const identity = await requireUserOrThrow(request, env);
    // identity may be an email or a JWT token depending on Access configuration
    if (identity && identity.includes && identity.includes('@')) {
      return new Response(JSON.stringify({ email: identity }), { headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ jwt: identity }), { headers: { 'content-type': 'application/json' } });
  } catch (err) {
    // requireUserOrThrow throws a Response for 401; rethrow to let Pages return it
    throw err;
  }

  // 3) Verify with jose against your team JWKS + AUD
  try {
    const team = env.CF_ACCESS_TEAM; // e.g. "skovgard"
    const JWKS = createRemoteJWKSet(
      new URL(`https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`)
    );
    const { payload, protectedHeader } = await jwtVerify(jwt, JWKS, {
      audience: env.CF_ACCESS_AUD, // value you saved as secret
      // issuer is optional; Access rotates issuers. You can also enforce:
      // issuer: `https://${team}.cloudflareaccess.com`,
    });
    // Prefer payload.email; fall back to header-based claim if present
    const email =
      payload.email ||
      request.headers.get("Cf-Access-Authenticated-User-Email") ||
      null;
    if (!email) return json({ error: "no-email" }, 401);
    return json({ email, header: protectedHeader.kid ? "verified" : "ok" });
  } catch (err) {
    return json({ error: "invalid-token", detail: err.message }, 401);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function getCookie(cookie, name) {
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}
