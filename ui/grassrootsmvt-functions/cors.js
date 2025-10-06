// cors.js — shared middleware for consistent CORS handling

export const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export function withCORS(env, requestOrigin) {
  // Use configured env var if available, else fallback to a safe default
  const allowedOrigin =
    env?.ALLOW_ORIGIN || "https://volunteers.grassrootsmvt.org";

  // If the requestOrigin exactly matches an allowed domain pattern, prefer it.
  // For simplicity here we prioritize the configured allowedOrigin.
  const originMatch = requestOrigin === allowedOrigin ? allowedOrigin : allowedOrigin;

  return {
    ...CORS_HEADERS,
    "Access-Control-Allow-Origin": originMatch,
    "Access-Control-Allow-Credentials": "true",
  };
}

export function handleOptions(request, env) {
  const origin = request.headers.get("Origin");
  return new Response(null, {
    status: 204,
    headers: withCORS(env, origin),
  });
}

export function jsonResponse(body, env, requestOrigin, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...withCORS(env, requestOrigin),
    },
  });
}
