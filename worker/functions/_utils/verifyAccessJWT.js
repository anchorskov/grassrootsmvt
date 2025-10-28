// worker/functions/_utils/verifyAccessJWT.js
// ✅ Cloudflare Zero Trust JWT verification helper

export async function verifyAccessJWT(request, env) {
  const jwt =
    request.headers.get(env.ACCESS_JWT_HEADER || 'Cf-Access-Jwt-Assertion') ||
    (request.headers.get('Cookie')?.match(/CF_Authorization=([^;]+)/)?.[1]);

  if (!jwt) {
    throw new Error('Missing Access token');
  }

  // Decode payload
  // Deprecated: Manual JWT validation removed. Use Cloudflare Access headers directly.
  // This file is no longer needed for authentication.
}
