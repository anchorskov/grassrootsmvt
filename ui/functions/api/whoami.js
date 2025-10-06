// ui/functions/api/whoami.js
import { handleOptions, getCorsHeaders, isAllowedOrigin } from '../_utils/cors.js';
import { jwtVerify, createRemoteJWKSet } from 'jose';

export async function onRequestOptions(context) {
  return handleOptions(context.request);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const origin = request.headers.get('Origin') || '';

  if (!isAllowedOrigin(origin)) {
    return new Response('CORS not allowed', { status: 403 });
  }

  const token =
    request.headers.get('Cf-Access-Jwt-Assertion') ||
    getCookie(request.headers.get('Cookie'), 'CF_Authorization');

  if (!token) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing Access token' }), {
      status: 401,
      headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }

  try {
    // 1. Build JWK set from your Cloudflare Access team domain
    const teamDomain = env.TEAM_DOMAIN; // e.g. "https://skovgard.cloudflareaccess.com"
    const JWKS = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));

    // 2. Verify JWT signature and claims
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: teamDomain,
      audience: env.POLICY_AUD,
    });

    // 3. Return verified email
    const email = payload.email;
    return new Response(JSON.stringify({ ok: true, email }), {
      headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('JWT verification failed:', err);
    return new Response(JSON.stringify({ ok: false, error: 'Invalid or expired token' }), {
      status: 401,
      headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }
}

// Helper to get CF_Authorization cookie
function getCookie(header, name) {
  const m = (header || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}
