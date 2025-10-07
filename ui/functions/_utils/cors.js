/**
 * Cloudflare Pages Functions — universal CORS utility
 * Supports: local dev, production site, API calls, and curl tests
 */

const ALLOWED_ORIGINS = [
  "https://grassrootsmvt.pages.dev",     // production
  "https://grassrootsmvt.org",           // custom domain (if mapped)
  "http://localhost:8788",               // local wrangler dev
  "http://127.0.0.1:8788"                // local direct
];

/**
 * Returns valid CORS headers for an allowed origin or '*' fallback for dev/curl
 */
export function getCorsHeaders(request) {
  const origin = request.headers.get("Origin");

  // allow known origins
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
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
 * Usage:
 *   import { applyCors } from '../_utils/cors.js'
 *   export async function onRequest(event) { return applyCors(event, myHandler) }
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
