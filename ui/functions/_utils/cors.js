/**
 * Cloudflare Pages Functions — universal CORS utility
 * Supports: local dev, production site, API calls, and curl tests
 */

const ALLOWED_ORIGINS = [
  "https://grassrootsmvt.pages.dev",     // production
  "https://grassrootsmvt.org",           // custom domain (if mapped)
  "http://localhost:8788",               // local wrangler dev
  "http://127.0.0.1:8788",               // local direct
  /^https:\/\/[a-z0-9-]+\.grassrootsmvt\.pages\.dev$/ // preview deployments
];

// Toggle CORS debug logging with env: set DEBUG_CORS="true" in Pages or Wrangler
const DEBUG_CORS = globalThis.DEBUG_CORS === "true";

/**
 * Returns valid CORS headers for an allowed origin or '*' fallback for dev/curl
 */
export function getCorsHeaders(request) {
  const origin = request.headers.get("Origin");

  // Log every origin request for debugging (will appear in Wrangler/Cloudflare Logs)
  if (DEBUG_CORS) {
    if (origin) {
      console.log("[CORS] Request origin:", origin);
    } else {
      console.log("[CORS] No Origin header present (likely curl or internal request)");
    }
  }

  // Optional: extend with Cloudflare environment var (comma-separated)
  const envAllowed = globalThis.ALLOW_ORIGIN
    ? globalThis.ALLOW_ORIGIN.split(",").map((o) => o.trim())
    : [];

  const allAllowed = [...ALLOWED_ORIGINS, ...envAllowed];

  const isAllowed = allAllowed.some((allowed) =>
    typeof allowed === "string"
      ? allowed === origin
      : allowed instanceof RegExp && allowed.test(origin)
  );

  // allow known origins
  if (origin && isAllowed) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Max-Age": "86400"
    };
  }

  // allow CLI/curl (no Origin header)
  if (!origin) {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    };
  }

  // otherwise reject
  if (DEBUG_CORS) {
    console.warn("[CORS] 🚫 Blocked origin:", origin);
  }
  return null;
}

/**
 * Handles CORS preflight requests
 */
export function handleCorsPreflight(request) {
  if (request.method === "OPTIONS") {
    const headers = getCorsHeaders(request);
    if (!headers) {
      return new Response("CORS not allowed", { status: 403 });
    }
    return new Response(null, { headers });
  }
  return null;
}

/**
 * Wrapper to apply CORS to your API handlers
 */
export async function applyCors(event, handler) {
  const { request } = event;
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  const headers = getCorsHeaders(request);
  if (!headers) {
    return new Response("CORS not allowed", { status: 403 });
  }

  const response = await handler(event);
  Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
  return response;
}
