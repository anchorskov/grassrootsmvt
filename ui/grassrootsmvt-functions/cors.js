// cors.js — shared middleware for consistent CORS handling

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

export function withCORS(env, requestOrigin) {
  // prefer an explicit env var when provided (wrangler.toml [vars])
  const configured = env?.ALLOW_ORIGIN;
  const origin = configured || requestOrigin;

  return getCorsHeaders(origin);
}

export function handleOptions(request, env) {
  const origin = request.headers.get("Origin");

  if (!isAllowedOrigin(origin) && !(env && env.ALLOW_ORIGIN)) {
    return new Response("CORS not allowed", { status: 403 });
  }

  // Explicitly return headers suitable for credentialed requests and preflight
  const allowedOrigin = env?.ALLOW_ORIGIN || origin;

  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Pragma, Cache-Control",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Max-Age": "86400",
    },
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
