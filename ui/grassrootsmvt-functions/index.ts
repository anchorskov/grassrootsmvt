function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;

  const allowed = [
    "https://volunteers.grassrootsmvt.org",
    "https://grassrootsmvt.pages.dev",
  ];

  // Allow any localhost or 127.0.0.1 origin for dev
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return true;
  }

  return allowed.includes(origin);
}

function getCorsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Requested-With, Pragma, Cache-Control, Accept, Origin",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const origin = request.headers.get("Origin") || "";
    const url = new URL(request.url);

    // 🧩 Handle preflight OPTIONS requests
    if (request.method === "OPTIONS") {
      if (!isAllowedOrigin(origin)) {
        return new Response("CORS not allowed", { status: 403 });
      }
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(origin),
      });
    }

    // 🛑 Reject disallowed origins for other methods
    if (origin && !isAllowedOrigin(origin)) {
      return new Response("Forbidden: Origin not allowed", { status: 403 });
    }

    // ✅ /api/ping — basic health check
    if (url.pathname === "/api/ping") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          ...getCorsHeaders(origin),
          "Content-Type": "application/json",
        },
      });
    }

    // ✅ Example: /api/call/next
    if (url.pathname === "/api/call/next" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      return new Response(
        JSON.stringify({ ok: true, next: "voter", received: body }),
        {
          headers: {
            ...getCorsHeaders(origin),
            "Content-Type": "application/json",
          },
        }
      );
    }

    // ✅ Example: /api/whoami
    if (url.pathname === "/api/whoami") {
      return new Response(JSON.stringify({ user: "volunteer" }), {
        headers: {
          ...getCorsHeaders(origin),
          "Content-Type": "application/json",
        },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
};
