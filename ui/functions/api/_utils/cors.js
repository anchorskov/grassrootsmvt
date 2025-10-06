export function getCorsHeaders(env) {
  const origin = env?.ALLOW_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Pragma, Cache-Control, Accept, Origin',
    'Access-Control-Allow-Credentials': 'true'
  };
}

export function withCors(responseInit, env) {
  return { ...responseInit, headers: { ...(responseInit.headers || {}), ...getCorsHeaders(env) } };
}
