/**
 * Minimal Access JWT verifier stub.
 * Currently it checks for the Cf-Access-Jwt-Assertion header or cookie and
 * returns a not-authorized result unless you replace this with full verification.
 *
 * This mirrors the behavior in the archived worker: unauthenticated requests
 * will return { valid: false } and the whoami route will respond 401.
 */
export async function verifyAccessJWT(request, env) {
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion') || getCookie(request, 'CF_Authorization');
  if (!jwt) return { valid: false };

  // TODO: replace with jose-based remote JWK verification using env.TEAM_DOMAIN & env.POLICY_AUD
  // For now, treat presence of a token as unauthenticated (safe default).
  return { valid: false };
}

function getCookie(request, name) {
  const cookie = request.headers.get('cookie');
  if (!cookie) return null;
  const pairs = cookie.split(/;\s*/);
  for (const p of pairs) {
    const [k, ...rest] = p.split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}
