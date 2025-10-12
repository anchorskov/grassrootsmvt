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

    // 📍 Geographic Metadata for Forms
    if (url.pathname === '/api/metadata') {
      try {
        const db = env.d1;
        
        // Query distinct values from Wyoming database (no state filtering needed)
        const [counties, houseDistricts, senateDistricts] = await Promise.all([
          db.prepare(`
            SELECT DISTINCT county FROM voters 
            WHERE county IS NOT NULL AND county != '' 
            ORDER BY county
          `).all(),
          
          db.prepare(`
            SELECT DISTINCT house FROM voters 
            WHERE house IS NOT NULL AND house != '' 
            ORDER BY CAST(house AS INTEGER)
          `).all(),
          
          db.prepare(`
            SELECT DISTINCT senate FROM voters 
            WHERE senate IS NOT NULL AND senate != '' 
            ORDER BY CAST(senate AS INTEGER)
          `).all()
        ]);

        return new Response(
          JSON.stringify({
            ok: true,
            state: "WY",
            counties: counties.results?.map(r => r.county) || [],
            house_districts: houseDistricts.results?.map(r => r.house) || [],
            senate_districts: senateDistricts.results?.map(r => r.senate) || []
          }),
          { 
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": env.ALLOW_ORIGIN || "*",
              "Access-Control-Allow-Methods": "GET, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type, Authorization"
            }
          }
        );
      } catch (error) {
        // Fallback with static Wyoming data if D1 query fails
        return new Response(
          JSON.stringify({
            ok: false,
            error: "metadata_query_failed",
            message: error.message,
            state: "WY",
            counties: ["ALBANY", "BIG HORN", "CAMPBELL", "CARBON", "CONVERSE", "CROOK", 
                      "FREMONT", "GOSHEN", "HOT SPRINGS", "JOHNSON", "LARAMIE", "LINCOLN",
                      "NATRONA", "NIOBRARA", "PARK", "PLATTE", "SHERIDAN", "SUBLETTE",
                      "SWEETWATER", "TETON", "UINTA", "WASHAKIE", "WESTON"],
            house_districts: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10",
                             "11", "12", "13", "14", "15", "16", "17", "18", "19", "20",
                             "21", "22", "23", "24", "25", "26", "27", "28", "29", "30",
                             "31", "32", "33", "34", "35", "36", "37", "38", "39", "40",
                             "41", "42", "43", "44", "45", "46", "47", "48", "49", "50",
                             "51", "52", "53", "54", "55", "56", "57", "58", "59", "60"],
            senate_districts: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10",
                              "11", "12", "13", "14", "15", "16", "17", "18", "19", "20",
                              "21", "22", "23", "24", "25", "26", "27", "28", "29", "30"]
          }),
          { 
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": env.ALLOW_ORIGIN || "*"
            },
            status: 500
          }
        );
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

    // 🔍 Check table schema
    if (url.pathname === '/api/db/schema' && url.searchParams.get('table')) {
      try {
        const db = env.d1;
        const tableName = url.searchParams.get('table');
        
        const result = await db.prepare(
          `PRAGMA table_info(${tableName});`
        ).all();

        return new Response(
          JSON.stringify({
            ok: true,
            table: tableName,
            columns: result.results || [],
            environment: env.ENVIRONMENT || 'unknown'
          }),
          { headers }
        );
      } catch (error) {
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
