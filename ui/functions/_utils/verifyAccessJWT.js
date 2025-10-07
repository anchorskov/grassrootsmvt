// ui/functions/_utils/verifyAccessJWT.js
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Verifies a Cloudflare Access JWT (from header or cookie).
 * Returns a consistent structure: { valid, email, payload, error }
 */
export async function verifyAccessJWT(request, env) {
  const token = getAccessJWT(request);
  if (!token) {
    return { valid: false, error: 'Missing Access token' };
  }

  const teamDomain =
    env.TEAM_DOMAIN ||
    (env.CF_ACCESS_TEAM ? `https://${env.CF_ACCESS_TEAM}.cloudflareaccess.com` : null);
  const aud = env.POLICY_AUD;

  if (!teamDomain || !aud) {
    return { valid: false, error: 'Missing TEAM_DOMAIN or POLICY_AUD environment variable' };
  }

  try {
    const JWKS = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: teamDomain,
      audience: aud,
    });

    const email = payload.email || null;
    return { valid: true, email, payload };
  } catch (err) {
    console.error('verifyAccessJWT: verification failed', err);
    return { valid: false, error: err.message || 'Token verification failed' };
  }
}

/**
 * Extracts Access JWT from Cf-Access-Jwt-Assertion header or CF_Authorization cookie.
 */
function getAccessJWT(request) {
  // Accept tokens from several locations, in order of precedence:
  // 1) Authorization: Bearer <token> (useful when frontend stores a token in localStorage)
  // 2) Cf-Access-Jwt-Assertion header (Cloudflare Access runtime)
  // 3) CF_Authorization cookie
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.split(/\s+/)[1] || null;
  }
  const headerToken = request.headers.get('Cf-Access-Jwt-Assertion');
  const cookieToken = getCookie(request, 'CF_Authorization');
  return headerToken || cookieToken || null;
}

/**
 * Simple cookie parser.
 */
function getCookie(request, name) {
  const cookie = request.headers.get('cookie');
  if (!cookie) return null;
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}
