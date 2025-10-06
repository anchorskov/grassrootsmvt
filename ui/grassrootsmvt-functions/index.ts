import { handleOptions, jsonResponse } from "./cors.js";

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return handleOptions(request, env);
    }

    if (url.pathname === "/api/ping") {
      return jsonResponse({ ok: true }, env, origin);
    }

    if (url.pathname === "/api/whoami") {
      return jsonResponse({ user: null }, env, origin);
    }

    if (url.pathname === "/api/call/next") {
      return jsonResponse({ next: null }, env, origin);
    }

    return jsonResponse({ error: "Not Found" }, env, origin, 404);
  },
};
