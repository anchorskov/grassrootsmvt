// src/index.js — Cloudflare Zero Trust module Worker
import { verifyAccessJWT } from "../functions/_utils/verifyAccessJWT.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const headers = { "Content-Type": "application/json" };

    if (url.pathname === "/api/ping") {
      return new Response(JSON.stringify({
        ok: true,
        worker: "grassrootsmvt",
        environment: env.ENVIRONMENT || "unknown",
        timestamp: Date.now()
      }), { headers });
    }

    if (url.pathname === "/api/whoami") {
      try {
        const payload = await verifyAccessJWT(request, env);
        return new Response(JSON.stringify({
          ok: true,
          email: payload.email,
          environment: env.ENVIRONMENT || "production",
          source: "Cloudflare Zero Trust"
        }), { headers });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: err.message }),
          { status: 401, headers });
      }
    }

    // 🗄️ List D1 Tables
    if (url.pathname === '/api/db/tables') {
      try {
        const db = env.d1;
        if (!db) throw new Error('No D1 binding available. Check wrangler.toml.');

        const result = await db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
        ).all();

        return new Response(
          JSON.stringify({
            ok: true,
            tables: result.results || [],
            environment: env.ENVIRONMENT || 'unknown'
          }),
          { headers }
        );
      } catch (error) {
        console.error('DB Error:', error);
        return new Response(
          JSON.stringify({
            ok: false,
            error: error.message,
            environment: env.ENVIRONMENT || 'unknown'
          }),
          { status: 500, headers }
        );
      }
    }

    return new Response(JSON.stringify({ ok: false, error: "Not Found" }),
      { status: 404, headers });
  }
};
