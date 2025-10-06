// cors.js — shared CORS utilities for Cloudflare Workers

export function isAllowedOrigin(origin) {
  if (!origin) return false;

  const allowed = [
    "https://volunteers.grassrootsmvt.org",
    "https://grassrootsmvt.pages.dev",
  ];

  // Allow localhost or 127.0.0.1 for dev
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return true;
  }

  return allowed.includes(origin);
}

export function getCorsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Requested-With, Pragma, Cache-Control, Accept, Origin",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

export function handleOptions(request, env) {
  const origin = request.headers.get("Origin");
  const allowedOrigin = env?.ALLOW_ORIGIN || (isAllowedOrigin(origin) ? origin : null);

  if (!allowedOrigin) {
    return new Response("CORS not allowed", { status: 403 });
  }

  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(allowedOrigin),
  });
}

export function jsonResponse(body, env, origin, status = 200) {
  const allowedOrigin = env?.ALLOW_ORIGIN || origin;
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders(allowedOrigin),
    },
  });
}
