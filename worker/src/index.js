// src/index.js — Cloudflare Zero Trust module Worker
import { verifyAccessJWT } from "../functions/_utils/verifyAccessJWT.js";

// --- CORS helpers ------------------------------------------------------------
function parseAllowedOrigins(env) {
  return (env.ALLOW_ORIGIN || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

// Return the request's Origin only if it's allowed; otherwise null
function pickAllowedOrigin(request, env) {
  const reqOrigin = request.headers.get("Origin");
  if (!reqOrigin) return null;
  const allowed = parseAllowedOrigins(env);
  return allowed.includes(reqOrigin) ? reqOrigin : null;
}

function withCorsHeaders(headers, allowedOrigin) {
  const h = new Headers(headers || {});
  h.set("Access-Control-Allow-Origin", allowedOrigin);
  h.set("Access-Control-Allow-Credentials", "true");
  const vary = h.get("Vary");
  if (!vary) h.set("Vary", "Origin");
  else if (!/\bOrigin\b/i.test(vary)) h.set("Vary", vary + ", Origin");
  return h;
}

function preflightResponse(origin) {
  return new Response(null, {
    status: 204,
    headers: withCorsHeaders({
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Cf-Access-Jwt-Assertion",
      "Access-Control-Max-Age": "86400",
      "Access-Control-Allow-Credentials": "true"
    }, allowedOrigin)
  });
}
// ---------------------------------------------------------------------------

function getCookie(req, name) {
  const raw = req.headers.get("Cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const allowedOrigin = pickAllowedOrigin(request, env) || "https://volunteers.grassrootsmvt.org";
    
    // Extract JWT from header or cookie
    const headerToken = request.headers.get("Cf-Access-Jwt-Assertion");
    const cookieToken = getCookie(request, "CF_Authorization");
    const accessJWT = headerToken || cookieToken;

    // CORS Preflight handler for OPTIONS requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': allowedOrigin,
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cf-Access-Jwt-Assertion',
          'Vary': 'Origin'
        }
      });
    }

    // Auth finish route - returns user to UI after Access login
    if (url.pathname === "/auth/finish") {
      const to = url.searchParams.get("to") || "https://volunteers.grassrootsmvt.org/";
      const html = `<!doctype html><meta charset="utf-8">
      <title>Returning…</title>
      <p>Returning to app…</p>
      <script>location.replace(${JSON.stringify(to)});</script>`;
      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // Auth config route - public endpoint returning TEAM_DOMAIN and POLICY_AUD
    if (url.pathname === "/auth/config") {
      const allowedOrigin = pickAllowedOrigin(request, env) || "https://volunteers.grassrootsmvt.org";
      return new Response(JSON.stringify({
        teamDomain: env.TEAM_DOMAIN,
        policyAud: env.POLICY_AUD
      }), {
        headers: withCorsHeaders({
          "Content-Type": "application/json"
        }, allowedOrigin)
      });
    }

    if (url.pathname === "/api/ping") {
      return new Response(JSON.stringify({
        ok: true,
        worker: "grassrootsmvt",
        environment: env.ENVIRONMENT || "unknown",
        timestamp: Date.now()
      }), { 
        status: 200,
        headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin)
      });
    }

    if (url.pathname === "/api/whoami") {
      try {
        const payload = await verifyAccessJWT(request, env);
        return new Response(JSON.stringify({
          ok: true,
          email: payload.email,
          environment: env.ENVIRONMENT || "production",
          source: "Cloudflare Zero Trust"
        }), { 
          status: 200,
          headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin)
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
          status: 401, 
          headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin)
        });
      }
    }

    // � Volunteer & Call Logging API

    if (url.pathname === '/api/voters') {
      // Enhanced voter filtering with context-aware queries
      try {
        const db = env.d1;
        
        // Parse query parameters
        const city = url.searchParams.get('city');
        const houseDistrict = url.searchParams.get('house_district');
        const senateDistrict = url.searchParams.get('senate_district');
        
        console.log("Enhanced filters applied:", { city, houseDistrict, senateDistrict });
        
        let sql = '';
        let bindings = [];
        let filtersApplied = {
          city: city || null,
          house_district: houseDistrict || null,
          senate_district: senateDistrict || null,
          city_mode: null
        };
        
        // Enhanced conditional priority logic
        if (houseDistrict) {
          if (city && city.toUpperCase() !== "(ALL)") {
            // Voters in specific house district + specific city
            sql = `
              SELECT voter_id, political_party, county, house, senate
              FROM voters 
              WHERE house = ?1 AND county = ?2
              LIMIT 25
            `;
            bindings = [houseDistrict, city];
            filtersApplied.city_mode = 'specific';
          } else {
            // All voters in house district
            sql = `
              SELECT voter_id, political_party, county, house, senate
              FROM voters 
              WHERE house = ?1
              LIMIT 25
            `;
            bindings = [houseDistrict];
            filtersApplied.city_mode = city === '(ALL)' ? 'all' : 'district_only';
          }
        } else if (senateDistrict) {
          if (city && city.toUpperCase() !== "(ALL)") {
            // Voters in specific senate district + specific city
            sql = `
              SELECT voter_id, political_party, county, house, senate
              FROM voters 
              WHERE senate = ?1 AND county = ?2
              LIMIT 25
            `;
            bindings = [senateDistrict, city];
            filtersApplied.city_mode = 'specific';
          } else {
            // All voters in senate district
            sql = `
              SELECT voter_id, political_party, county, house, senate
              FROM voters 
              WHERE senate = ?1
              LIMIT 25
            `;
            bindings = [senateDistrict];
            filtersApplied.city_mode = city === '(ALL)' ? 'all' : 'district_only';
          }
        } else if (city) {
          // Voters by city only
          sql = `
            SELECT voter_id, political_party, county, house, senate
            FROM voters 
            WHERE county = ?1
            LIMIT 25
          `;
          bindings = [city];
          filtersApplied.city_mode = 'city_only';
        } else {
          // Default fallback - all voters
          sql = `
            SELECT voter_id, political_party, county, house, senate
            FROM voters 
            LIMIT 25
          `;
          bindings = [];
          filtersApplied.city_mode = 'fallback';
        }
        
        // Execute query
        const votersResult = await db.prepare(sql).bind(...bindings).all();
        
        // Get related cities for current selection (for UI context)
        let cities = [];
        try {
          if (houseDistrict || senateDistrict) {
            const districtField = houseDistrict ? 'house' : 'senate';
            const districtValue = houseDistrict || senateDistrict;
            
            const citiesResult = await db.prepare(`
              SELECT DISTINCT county FROM voters 
              WHERE ${districtField} = ?1 AND county IS NOT NULL AND county != ''
              ORDER BY county
            `).bind(districtValue).all();
            
            cities = ['(ALL)', ...(citiesResult.results?.map(r => r.county) || [])];
          }
        } catch (cityError) {
          console.warn('Failed to fetch related cities:', cityError);
        }

        return new Response(
          JSON.stringify({
            ok: true,
            filters_applied: filtersApplied,
            cities: cities,
            total: votersResult.results?.length || 0,
            voters: votersResult.results || []
          }),
          { 
            headers: withCorsHeaders({
              "Content-Type": "application/json",
              "Cache-Control": "max-age=120"
            }, allowedOrigin)
          }
        );
      } catch (error) {
        console.error('Enhanced voters query error:', error);
        return new Response(
          JSON.stringify({ 
            ok: false, 
            error: "query_failed", 
            message: error.message 
          }),
          { 
            headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin),
            status: 500 
          }
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
          { status: 200, headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin) }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ ok: false, error: error.message }),
          { status: 401, headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin) }
        );
      }
    }

    if (url.pathname === '/api/canvass' && request.method === 'POST') {
      // Log canvassing activity from volunteer
      try {
        const payload = await verifyAccessJWT(request, env);
        const email = payload.email;
        const { 
          voter_id, 
          result, 
          notes, 
          pulse_opt_in, 
          pitch_used, 
          location_lat, 
          location_lng, 
          door_status, 
          followup_needed 
        } = await request.json();

        const db = env.d1;
        await db.prepare(
          `INSERT INTO canvass_activity 
           (voter_id, volunteer_email, result, notes, pulse_opt_in, pitch_used, location_lat, location_lng, door_status, followup_needed)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
        ).bind(
          voter_id, 
          email, 
          result, 
          notes, 
          pulse_opt_in || false, 
          pitch_used, 
          location_lat, 
          location_lng, 
          door_status, 
          followup_needed || false
        ).run();

        return new Response(
          JSON.stringify({
            ok: true,
            message: 'Canvass logged successfully',
            voter_id: voter_id,
            volunteer: email
          }),
          { 
            headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin)
          }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ ok: false, error: error.message }),
          { 
            status: error.message.includes('JWT') ? 401 : 500, 
            headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin)
          }
        );
      }
    }

    if (url.pathname === '/api/pulse' && request.method === 'POST') {
      // Track pulse opt-ins (text/email consent)
      try {
        const { voter_id, contact_method, consent_source } = await request.json();
        
        // Volunteer email is optional for this endpoint
        let volunteer_email = null;
        try {
          const payload = await verifyAccessJWT(request, env);
          volunteer_email = payload.email;
        } catch (jwtError) {
          // Continue without volunteer email if JWT fails (for public forms)
          console.log('No JWT provided for pulse opt-in, continuing without volunteer email');
        }

        const db = env.d1;
        
        // First delete any existing record for this voter_id + contact_method
        await db.prepare(
          `DELETE FROM pulse_optins WHERE voter_id = ?1 AND contact_method = ?2`
        ).bind(voter_id, contact_method).run();
        
        // Then insert the new record
        await db.prepare(
          `INSERT INTO pulse_optins 
           (voter_id, contact_method, consent_given, consent_source, volunteer_email, created_at)
           VALUES (?1, ?2, 1, ?3, ?4, datetime('now'))`
        ).bind(voter_id, contact_method, consent_source, volunteer_email).run();

        return new Response(
          JSON.stringify({
            ok: true,
            message: 'Pulse opt-in recorded',
            voter_id: voter_id,
            method: contact_method
          }),
          { 
            headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin)
          }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ ok: false, error: error.message }),
          { 
            status: 500, 
            headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin)
          }
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
          { status: 200, headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin) }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ ok: false, error: error.message }),
          { status: 401, headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin) }
        );
      }
    }

    // 📍 Geographic Metadata for Forms with Enhanced District↔City Logic
    if (url.pathname === '/api/metadata') {
      try {
        const db = env.d1;
        
        // Parse query parameters for smart mode detection
        const city = url.searchParams.get('city'); // This will be treated as county
        const houseDistrict = url.searchParams.get('house_district');
        const senateDistrict = url.searchParams.get('senate_district');
        
        // DISTRICT→COUNTY MODE: User selects district, get counties in that district
        if (houseDistrict || senateDistrict) {
          const districtField = houseDistrict ? 'house' : 'senate';
          const districtValue = houseDistrict || senateDistrict;
          const districtType = houseDistrict ? 'house_district' : 'senate_district';
          
          console.log(`District→County mode: querying counties for ${districtType}=${districtValue}`);
          
          const countiesResult = await db.prepare(`
            SELECT DISTINCT county FROM voters 
            WHERE ${districtField} = ?1 AND county IS NOT NULL AND county != ''
            ORDER BY county
          `).bind(districtValue).all();
          
          const counties = countiesResult.results?.map(r => r.county) || [];
          
          // Always include "(ALL)" as first option, then sorted counties
          const countiesWithAll = ['(ALL)', ...counties];
          
          return new Response(
            JSON.stringify({
              ok: true,
              mode: "district_to_city",
              [districtType]: districtValue,
              district: districtValue,
              cities: countiesWithAll  // Using 'cities' for API consistency
            }),
            { 
              headers: withCorsHeaders({
                "Content-Type": "application/json",
                "Cache-Control": "max-age=86400"
              }, allowedOrigin)
            }
          );
        }
        
        // COUNTY→DISTRICT MODE: User selects county, get districts in that county
        if (city) {
          console.log(`County→District mode: querying districts for county=${city}`);
          
          const [houseResult, senateResult] = await Promise.all([
            db.prepare(`
              SELECT DISTINCT house FROM voters 
              WHERE county = ?1 AND house IS NOT NULL AND house != ''
              ORDER BY CAST(house AS INTEGER)
            `).bind(city).all(),
            
            db.prepare(`
              SELECT DISTINCT senate FROM voters 
              WHERE county = ?1 AND senate IS NOT NULL AND senate != ''
              ORDER BY CAST(senate AS INTEGER)
            `).bind(city).all()
          ]);
          
          const houseDistricts = houseResult.results?.map(r => r.house) || [];
          const senateDistricts = senateResult.results?.map(r => r.senate) || [];
          
          return new Response(
            JSON.stringify({
              ok: true,
              mode: "city_to_district",
              city: city,
              house_districts: houseDistricts,
              senate_districts: senateDistricts
            }),
            { 
              headers: withCorsHeaders({
                "Content-Type": "application/json",
                "Cache-Control": "max-age=86400"
              }, allowedOrigin)
            }
          );
        }
        
        // DEFAULT MODE: No specific parameters, return all metadata
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
            mode: "default",
            state: "WY",
            counties: counties.results?.map(r => r.county) || [],
            cities: counties.results?.map(r => r.county) || [], // For API consistency
            house_districts: houseDistricts.results?.map(r => r.house) || [],
            senate_districts: senateDistricts.results?.map(r => r.senate) || [],
            auto_populate: false
          }),
          { 
            headers: withCorsHeaders({
              "Content-Type": "application/json",
              "Cache-Control": "max-age=86400"
            }, allowedOrigin)
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
            headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin),
            status: 500
          }
        );
      }
    }

    // � Message Templates API
    if (url.pathname === '/api/templates') {
      try {
        const db = env.d1;
        const category = url.searchParams.get('category');
        
        let sql = `
          SELECT id, title, category, body_text
          FROM message_templates
          WHERE is_active = 1
        `;
        let bindings = [];
        
        if (category) {
          sql += ` AND category = ?1`;
          bindings = [category];
        }
        
        sql += ` ORDER BY id`;
        
        const result = await db.prepare(sql).bind(...bindings).all();

        return new Response(
          JSON.stringify({
            ok: true,
            templates: result.results || []
          }),
          { 
            headers: withCorsHeaders({
              "Content-Type": "application/json",
              "Cache-Control": "max-age=300"
            }, allowedOrigin)
          }
        );
      } catch (error) {
        console.error('Templates query error:', error);
        return new Response(
          JSON.stringify({ 
            ok: false, 
            error: "templates_query_failed", 
            message: error.message 
          }),
          { 
            headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin),
            status: 500 
          }
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
          { status: 200, headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin) }
        );
      } catch (error) {
        console.error('DB Error:', error);
        return new Response(
          JSON.stringify({
            ok: false,
            error: error.message,
            environment: env.ENVIRONMENT || 'unknown'
          }),
          { status: 500, headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin) }
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
          { status: 200, headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin) }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: error.message,
            environment: env.ENVIRONMENT || 'unknown'
          }),
          { status: 500, headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin) }
        );
      }
    }

    return new Response(JSON.stringify({ ok: false, error: "Not Found" }), {
      status: 404,
      headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin)
    });
  }
};
