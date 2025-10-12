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

    // � Volunteer & Call Logging API

    if (url.pathname === '/api/voters') {
      // Return small voter sample for volunteers
      try {
        const db = env.d1;
        const result = await db.prepare(`
          SELECT voter_id, political_party, county, senate, house
          FROM voters
          LIMIT 25;
        `).all();

        return new Response(
          JSON.stringify({ ok: true, voters: result.results || [] }),
          { headers }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ ok: false, error: error.message }),
          { status: 500, headers }
        );
      }
    }

    if (url.pathname === '/api/call' && request.method === 'POST') {
      // Log a call activity from volunteer
      try {
        const payload = await verifyAccessJWT(request, env);
        const email = payload.email;
        const { voter_id, call_result, notes } = await request.json();

        const db = env.d1;
        await db.prepare(
          `INSERT INTO call_activity (voter_id, volunteer_email, call_result, notes)
           VALUES (?1, ?2, ?3, ?4)`
        ).bind(voter_id, email, call_result, notes).run();

        return new Response(
          JSON.stringify({
            ok: true,
            message: 'Call logged successfully',
            volunteer: email
          }),
          { headers }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ ok: false, error: error.message }),
          { status: 401, headers }
        );
      }
    }

    if (url.pathname === '/api/activity') {
      // Return recent call activity by authenticated volunteer
      try {
        const payload = await verifyAccessJWT(request, env);
        const email = payload.email;

        const db = env.d1;
        const result = await db.prepare(
          `SELECT * FROM call_activity WHERE volunteer_email = ?1 ORDER BY created_at DESC LIMIT 10;`
        ).bind(email).all();

        return new Response(
          JSON.stringify({ ok: true, activity: result.results || [] }),
          { headers }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ ok: false, error: error.message }),
          { status: 401, headers }
        );
      }
    }

    // �🗄️ List D1 Tables
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
