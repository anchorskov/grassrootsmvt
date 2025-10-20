// worker/src/utils/cors.js
// Centralized CORS management for GrassrootsMVT Workers.
// Ensures correct headers in local dev and production.

/**
 * Parse comma-separated origin list from env vars.
 * Falls back to common localhost origins if not configured.
 */
function parseAllowedOrigins(env) {
  const raw = env.ALLOW_ORIGIN_DEV || '';
  const configured = raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  
  // If no origins configured, provide sensible defaults for development
  if (configured.length === 0) {
    return [
      'http://localhost:8788',
      'http://127.0.0.1:8788',
      'http://localhost:5173'
    ];
  }
  
  return configured;
}

/**
 * Determines if we should apply CORS (dev only).
 */
export function isCorsEnabled(env) {
  const envName = (env.ENVIRONMENT || '').toLowerCase();
  return envName !== 'production';
}

/**
 * Build base CORS headers.
 * Dynamically sets `Access-Control-Allow-Origin` if the request origin matches allowed list.
 */
export function getCorsHeaders(req, env) {
  const headers = {};

  if (!isCorsEnabled(env)) return headers;

  const requestOrigin = req.headers.get('Origin');
  const allowedOrigins = parseAllowedOrigins(env);

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    headers['Access-Control-Allow-Origin'] = requestOrigin;
  } else if (allowedOrigins.length > 0) {
    // Allow first origin as fallback (for dev convenience)
    headers['Access-Control-Allow-Origin'] = allowedOrigins[0];
  }

  headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
  headers['Access-Control-Allow-Headers'] =
    'Origin, X-Requested-With, Content-Type, Accept, Authorization';
  headers['Access-Control-Allow-Credentials'] = 'true';
  headers['Access-Control-Max-Age'] = '600';
  headers['Vary'] = 'Origin';

  return headers;
}

/**
 * Handles CORS preflight requests.
 * Returns early if the request method is OPTIONS.
 */
export function maybeHandleCorsPreflight(req, env) {
  if (req.method === 'OPTIONS') {
    const headers = getCorsHeaders(req, env);
    return new Response(null, { status: 204, headers });
  }
  return null;
}

/**
 * Wraps a Response with CORS headers (only in dev).
 * Stream-safe: avoids disturbing consumed ReadableStreams.
 */
export async function applyCors(req, env, res) {
  if (!isCorsEnabled(env)) return res;

  const corsHeaders = getCorsHeaders(req, env);
  const newHeaders = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders)) {
    newHeaders.set(k, v);
  }

  let body = null;
  try {
    if (!res.bodyUsed && res.body) {
      body = res.body;
    } else if (res.bodyUsed) {
      // Re-clone the response safely if its body was already used
      const clone = res.clone();
      body = await clone.text();
    }
  } catch (err) {
    console.warn('⚠️ Stream-safe clone fallback failed:', err.message);
  }

  return new Response(body, {
    status: res.status,
    statusText: res.statusText,
    headers: newHeaders,
  });
}

/**
 * Safe wrapper to handle all responses (success or error) with CORS.
 */
export async function handleWithCors(handler, req, env) {
  try {
    const preflight = maybeHandleCorsPreflight(req, env);
    if (preflight) return preflight;

    const res = await handler(req, env);
    if (!(res instanceof Response)) {
      throw new Error('Handler did not return a Response');
    }
    return await applyCors(req, env, res);
  } catch (err) {
    console.error('⚠️ Worker error:', err);
    const res = new Response(
      JSON.stringify({ error: err.message || 'Internal error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
    return await applyCors(req, env, res);
  }
}
