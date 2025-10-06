// ui/functions/_utils/cors.js

/**
 * Determines if the request origin is allowed based on environment and defaults.
 */
export function getAllowedOrigin(env, origin) {
  const allowedOrigins = [
    'https://volunteers.grassrootsmvt.org',
    'https://grassrootsmvt.pages.dev',
    'http://localhost:8787',
    'http://127.0.0.1:8787'
  ];

  // Add environment-configured origins (comma-separated)
  if (env?.ALLOW_ORIGIN) {
    const envOrigins = env.ALLOW_ORIGIN.split(',').map(o => o.trim());
    for (const o of envOrigins) {
      if (!allowedOrigins.includes(o)) allowedOrigins.push(o);
    }
  }

  // Allow local dev and matching pages domains
  if (
    origin &&
    (allowedOrigins.includes(origin) ||
      /^https:\/\/[a-z0-9-]+\.grassrootsmvt\.pages\.dev$/.test(origin) ||
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
  ) {
    return origin;
  }

  // Default fallback
  return allowedOrigins[0];
}

/**
 * Builds consistent CORS headers for responses.
 */
export function getCorsHeaders(env, origin) {
  const allowedOrigin = getAllowedOrigin(env, origin);
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, Cf-Access-Jwt-Assertion, X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin'
  };
}

/**
 * Handles OPTIONS (preflight) requests.
 */
export function handleOptions(request, env) {
  const origin = request.headers.get('Origin');
  const headers = getCorsHeaders(env, origin);
  return new Response(null, { status: 204, headers });
}

/**
 * Utility: quick origin validation for handlers.
 */
export function isAllowedOrigin(origin, env) {
  const allowedOrigin = getAllowedOrigin(env, origin);
  return origin === allowedOrigin;
}
