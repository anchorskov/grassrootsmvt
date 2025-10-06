import { getCorsHeaders } from "./cors.js";

export default {
  async fetch(request: Request, env: any) {
    const origin = request.headers.get("Origin") || "*";

    // Handle preflight OPTIONS requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(origin),
      });
    }

    const url = new URL(request.url);

    if (url.pathname === "/api/ping") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          ...getCorsHeaders(origin),
          "Content-Type": "application/json",
        },
      });
    }

    if (url.pathname === "/api/whoami") {
      return new Response(JSON.stringify({ user: "volunteer", authenticated: true }), {
        headers: {
          ...getCorsHeaders(origin),
          "Content-Type": "application/json",
        },
      });
    }

    if (url.pathname === "/api/call/next" && request.method === "POST") {
      return new Response(JSON.stringify({ ok: true, next: "voter" }), {
        headers: {
          ...getCorsHeaders(origin),
          "Content-Type": "application/json",
        },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
};
