import {
  isAllowedOrigin,
  handleOptions,
  jsonResponse,
  getCorsHeaders,
} from "./cors.js";
import { validateAccessJWT } from "./auth";

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    // 🧩 Handle preflight OPTIONS
    if (request.method === "OPTIONS") {
      return handleOptions(request, env);
    }

    // 🛑 Block disallowed origins for all other requests
    if (origin && !isAllowedOrigin(origin)) {
      return new Response("Forbidden: Origin not allowed", { status: 403 });
    }

    // ✅ /api/ping — basic health check
    if (url.pathname === "/api/ping") {
      return jsonResponse({ ok: true }, env, origin);
    }

    // ✅ /api/login — automatic sign-in via Cloudflare Access
    if (url.pathname === "/api/login") {
      const email = request.headers.get("Cf-Access-Authenticated-User-Email");
      const userId = request.headers.get("Cf-Access-Authenticated-User-Id");

      if (!email) {
        return jsonResponse(
          { error: "Not signed in", message: "Access headers missing" },
          env,
          origin,
          401
        );
      }

      const token = crypto.randomUUID();
      return jsonResponse(
        { ok: true, token, user: { email, id: userId } },
        env,
        origin
      );
    }

    // ✅ /api/me and /api/whoami — verify current user via JWT validation
    if (url.pathname === "/api/me" || url.pathname === "/api/whoami") {
      const validation = await validateAccessJWT(request, env);

      if (!validation.valid) {
        return new Response(JSON.stringify({ error: "Not signed in", message: validation.error }), {
          status: 401,
          headers: {
            "Content-Type": "application/json",
            ...getCorsHeaders(env?.ALLOW_ORIGIN || origin),
          },
        });
      }

      return new Response(JSON.stringify({ ok: true, user: { email: validation.email } }), {
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(env?.ALLOW_ORIGIN || origin),
        },
      });
    }

    // ✅ Example: /api/call/next
    if (url.pathname === "/api/call/next" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      return jsonResponse({ ok: true, next: "voter", received: body }, env, origin);
    }

    // ✅ /random — UUID generator
    if (url.pathname === "/random") {
      const uuid = crypto.randomUUID();
      return new Response(uuid, {
        status: 200,
        headers: getCorsHeaders(origin),
      });
    }

    // Default 404
    return new Response("Not Found", {
      status: 404,
      headers: getCorsHeaders(origin),
    });
  },
};
