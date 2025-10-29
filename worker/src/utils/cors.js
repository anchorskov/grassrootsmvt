// worker/src/utils/cors.js
// Centralized CORS helpers for Cloudflare Workers
// Exports used across the codebase:
// - parseAllowedOrigins(env)
// - pickAllowedOrigin(request, env)
// - preflightResponse(allowedOrigin, request)
// - withCorsHeaders(handler)

function parseCSV(s) {
  return String(s || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

/**
 * Return a normalized list of explicitly allowed origins from env.
 * Supported env vars:
 *  - CORS_ALLOW_ORIGINS: comma-separated origins
 *  - PUBLIC_HOSTNAME: canonical host for prod, e.g. volunteers.grassrootsmvt.org
 */
export function parseAllowedOrigins(env) {
  const fromEnv = parseCSV(env?.CORS_ALLOW_ORIGINS);
  const devOrigins = parseCSV(env?.ALLOW_ORIGIN_DEV);
  const prodHost = (env?.PUBLIC_HOSTNAME || '').trim();
  const prod = prodHost ? [`https://${prodHost}`] : ['https://volunteers.grassrootsmvt.org'];

  // Local dev defaults for wrangler
  const local = [
    'http://localhost:8787',
    'http://127.0.0.1:8787',
    'http://localhost:8788',
    'http://127.0.0.1:8788',
  ];

  return Array.from(new Set([...fromEnv, ...devOrigins, ...prod, ...local]));
}

function originMatchesPreview(origin) {
  try {
    const o = new URL(origin);
    return ['.pages.dev', '.workers.dev'].some(sfx => o.hostname.endsWith(sfx));
  } catch {
    return false;
  }
}

/**
 * Choose the single origin to echo in CORS headers.
 * If no Origin header, echo the request's own origin.
 */
export function pickAllowedOrigin(request, env) {
  const origin = request.headers.get('origin');
  const requestOrigin = (() => {
    try { return new URL(request.url).origin; } catch { return null; }
  })();

  if (!origin) return requestOrigin || 'https://volunteers.grassrootsmvt.org';

  const allow = new Set(parseAllowedOrigins(env));

  // Always allow same-origin
  if (requestOrigin && origin === requestOrigin) return origin;

  // Exact allow-list match
  if (allow.has(origin)) return origin;

  // Preview domains by suffix
  if (originMatchesPreview(origin)) return origin;

  // Fallback to canonical prod or the request's origin
  return allow.values().next().value || requestOrigin || origin;
}

/**
 * Standard preflight response for OPTIONS requests.
 */
export function preflightResponse(allowedOrigin, request) {
  const acrh = request?.headers?.get?.('access-control-request-headers') || 'content-type,authorization';
  const acrm = request?.headers?.get?.('access-control-request-method') || 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': allowedOrigin,
      'access-control-allow-methods': acrm,
      'access-control-allow-headers': acrh,
      'access-control-allow-credentials': 'true',
      'vary': 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
    },
  });
}

/**
 * Wrap a route handler to automatically attach CORS headers and handle OPTIONS.
 * Usage in a route module:
 *   export const onRequest = withCorsHeaders(async (req, env, ctx) => { ... });
 * Or with your router:
 *   router.get('/ping', withCorsHeaders(async (req, env, ctx) => { ... }));
 */
export function withCorsHeaders(handler) {
  return async (request, env, ctx = {}) => {
    const allowedOrigin = pickAllowedOrigin(request, env);

    if (request.method === 'OPTIONS') {
      return preflightResponse(allowedOrigin, request);
    }

    // Call downstream handler, inject allowedOrigin so handlers can reuse it.
    const res = await handler(request, env, { ...ctx, allowedOrigin });

    // If handler already set headers, just append/override CORS bits.
    if (res instanceof Response) {
      const headers = new Headers(res.headers);
      headers.set('access-control-allow-origin', allowedOrigin);
      headers.set('access-control-allow-credentials', 'true');
      return new Response(res.body, { status: res.status, headers });
    }

    // If handler returned a plain object, wrap as JSON with CORS.
    return new Response(JSON.stringify(res ?? {}), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-origin': allowedOrigin,
        'access-control-allow-credentials': 'true',
      },
    });
  };
}
