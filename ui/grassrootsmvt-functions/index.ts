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

    // Test-only routes expected by vitest
    if (url.pathname === "/message") {
      return new Response("Hello, World!", { status: 200 });
    }

    if (url.pathname === "/random") {
      // UUID v4 generator using Web Crypto API
      function uuidv4(): string {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        // Per RFC4122 section 4.4
        bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
        bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
        const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
      }

      const uuid = uuidv4();
      return new Response(uuid, { status: 200 });
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
      const email = request.headers.get("Cf-Access-Authenticated-User-Email");

      if (!email) {
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": env?.ALLOW_ORIGIN || origin,
            "Access-Control-Allow-Credentials": "true",
          },
        });
      }

      return new Response(JSON.stringify({ ok: true, email }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": env?.ALLOW_ORIGIN || origin,
          "Access-Control-Allow-Credentials": "true",
        },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
};
