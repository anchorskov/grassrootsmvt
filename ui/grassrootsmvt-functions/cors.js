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

// New simple export expected by the user: corsHeaders(origin)
export function corsHeaders(origin) {
  const allowedOrigins = [
    "https://volunteers.grassrootsmvt.org",
    "https://grassrootsmvt.pages.dev",
    "http://localhost:8787",
    "http://127.0.0.1:8787",
  ];

  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Requested-With, Pragma, Cache-Control",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };

  // only allow the request origin if it's on the approved list
  if (origin && allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  } else {
    // fallback to strict mode — no wildcard for credentialed requests
    headers["Access-Control-Allow-Origin"] = "https://volunteers.grassrootsmvt.org";
  }

  return headers;
}

// Export the universal helper expected by index.ts
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
