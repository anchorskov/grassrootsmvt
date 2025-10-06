// _utils/cors.js
export function getCorsHeaders(origin, env) {
  const allowedOrigin = env?.ALLOW_ORIGIN || 'https://volunteers.grassrootsmvt.org';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cf-Access-Jwt-Assertion',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin'
  };
}

export function isAllowedOrigin(origin, env) {
  const allowed = env?.ALLOW_ORIGIN || 'https://volunteers.grassrootsmvt.org';
  return origin === allowed;
}

export function handleOptions(request, env) {
  const origin = request.headers.get('Origin') || '';
  if (!isAllowedOrigin(origin, env)) {
    return new Response('Forbidden', { status: 403 });
  }

  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(origin, env),
  });
}
