// ui/functions/_utils/cors.js
export function getAllowedOrigin(env, origin) {
  const allowed = env?.ALLOW_ORIGIN?.trim() || 'https://volunteers.grassrootsmvt.org';
  if (origin && (origin === allowed || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))) {
    return origin;
  }
  return allowed;
}

export function getCorsHeaders(env, origin) {
  const allowedOrigin = getAllowedOrigin(env, origin);
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cf-Access-Jwt-Assertion',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin'
  };
}

export function handleOptions(request, env) {
  const origin = request.headers.get('Origin');
  const headers = getCorsHeaders(env, origin);
  return new Response(null, { status: 204, headers });
}
