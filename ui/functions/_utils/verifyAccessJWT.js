// ui/functions/_utils/verifyAccessJWT.js
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Verifies a Cloudflare Access JWT (from header or cookie).
 * @param {Request} request
 * @param {Record<string,string>} env
 * @returns {Promise<{valid: boolean, email?: string, payload?: object, error?: string}>}
 */
export async function verifyAccessJWT(request, env) {
  const token = getAccessJWT(request);
  if (!token) {
    return { valid: false, error: 'Missing Access token' };
  }

  // Resolve team domain (either TEAM_DOMAIN or CF_ACCESS_TEAM)
  const teamDomain =
    env.TEAM_DOMAIN ||
    (env.CF_ACCESS_TEAM ? `https://${env.CF_ACCESS_TEAM}.cloudflareaccess.com` : null);

  if (!teamDomain || !env.POLICY_AUD) {
    return {
      valid: false,
      error: 'Missing TEAM_DOMAIN or POLICY_AUD environment variable',
    };
  }

  try {
    // Create remote JWKS endpoint
    const JWKS = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));

    // Verify the token’s signature, audience, and issuer
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: teamDomain,
      audience: env.POLICY_AUD,
    });

    const email = payload.email || null;

    return { valid: true, email, payload };
  } catch (err) {
    console.error('verifyAccessJWT: verification failed', err);
    return { valid: false, error: err.message || 'Token verification failed' };
  }
}

/**
 * Attempts to extract the Access token from header or cookie.
 */
function getAccessJWT(request) {
  const headerToken = request.headers.get('Cf-Access-Jwt-Assertion');
  const cookieToken = getCookie(request, 'CF_Authorization');
  return headerToken || cookieToken || null;
}

/**
 * Parses a named cookie from the request headers.
 */
function getCookie(request, name) {
  const cookie = request.headers.get('cookie');
  if (!cookie) return null;
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}
