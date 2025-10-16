// src/index.js — Cloudflare Zero Trust module Worker
import { verifyAccessJWT } from "../functions/_utils/verifyAccessJWT.js";

// --- Environment Detection ---------------------------------------------------
function isLocalDevelopment(env) {
  // Check for local development indicators
  const hasLocalEnvVars = (
    env.ENVIRONMENT === 'local' ||
    env.ENVIRONMENT === 'development' ||
    env.LOCAL_DEVELOPMENT === 'true' ||
    env.DISABLE_AUTH === 'true'
  );
  
  // Detect wrangler dev environment by checking for production-specific vars
  // In production, these would be set; in local dev with wrangler dev, they're typically undefined
  const isWranglerDev = (
    typeof env.CF_ZONE_ID === 'undefined' && 
    typeof env.CF_ACCOUNT_ID === 'undefined' &&
    typeof env.CLOUDFLARE_ACCOUNT_ID === 'undefined'
  );
  
  return hasLocalEnvVars || isWranglerDev;
}

function getEnvironmentConfig(env) {
  const isLocal = isLocalDevelopment(env);
  
  return {
    environment: isLocal ? 'local' : 'production',
    isLocal: isLocal,
    auth: {
      enabled: !isLocal,
      bypassAuthentication: isLocal
    },
    allowedOrigins: parseAllowedOrigins(env),
    debug: isLocal
  };
}
// ---------------------------------------------------------------------------

// --- CORS helpers ------------------------------------------------------------
function parseAllowedOrigins(env) {
  const defaultOrigins = isLocalDevelopment(env) 
    ? ["http://localhost:8788", "http://localhost:8080", "http://127.0.0.1:8788"]
    : ["https://volunteers.grassrootsmvt.org"];
    
  return (env.ALLOW_ORIGIN || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .concat(defaultOrigins);
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
    }, origin)
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

// Authentication middleware with local development bypass
async function authenticateRequest(request, env) {
  const config = getEnvironmentConfig(env);
  
  // Bypass authentication in local development
  if (config.auth.bypassAuthentication) {
    if (config.debug) {
      console.log('[LOCAL] Bypassing authentication - using mock user');
    }
    return {
      email: 'dev@localhost',
      name: 'Local Developer',
      isLocal: true
    };
  }
  
  // Production authentication via Cloudflare Access JWT
  return await verifyAccessJWT(request, env);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Normalize /api/* to /* so both /auth/finish and /api/auth/finish work
    const normalizedPath = url.pathname.replace(/^\/api(?=\/|$)/, "");

    // ---- helpers ----------------------------------------------------------
    const getOrigin = () => request.headers.get("Origin") || "";

    function withCorsHeaders(base = {}, origin = "") {
      const allow = (env.ALLOW_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
      const isAllowed = allow.includes(origin);
      return {
        "Vary": "Origin",
        ...(isAllowed ? {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Allow-Headers": "authorization, content-type",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS"
        } : {}),
        ...base
      };
    }

    // Read Access JWT from cookie first, then header as fallback
    function getAccessJwt(req) {
      const cookie = req.headers.get("Cookie") || "";
      const fromCookie = cookie.split(/;\s*/).find(x => x.startsWith("CF_Authorization="));
      if (fromCookie) {
        return decodeURIComponent(fromCookie.split("=", 2)[1] || "");
      }
      return req.headers.get("Cf-Access-Jwt-Assertion") || "";
    }

    async function verifyAccessJWTOrFail(req, env) {
      const jwt = getAccessJwt(req);
      if (!jwt) {
        throw new Error("Missing Access token");
      }
      // Use existing verifyAccessJWT utility
      const result = await verifyAccessJWT(req, env);
      return { ok: true, email: result.email, details: result };
    }

    const config = getEnvironmentConfig(env);
    const allowedOrigin = pickAllowedOrigin(request, env) || config.allowedOrigins[0];
    
    // Debug logging for local development
    if (config.debug) {
      console.log(`[${config.environment.toUpperCase()}] ${request.method} ${url.pathname}`);
    }

    // Handle OPTIONS preflight early
    if (request.method === "OPTIONS") {
      const headers = withCorsHeaders({}, getOrigin());
      return new Response(null, { headers });
    }

    // Auth finish route - returns user to UI after Access login
    // Canonical finish endpoint: /auth/finish (and /api/auth/finish via normalization)
    if (normalizedPath === "/auth/finish") {
      const to = url.searchParams.get("to") || config.allowedOrigins[0] + "/";
      const html = `<!doctype html><meta charset="utf-8">
      <title>Returning…</title>
      <p>Returning to app…</p>
      <script>location.replace(${JSON.stringify(to)});</script>`;
      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // Defensive catch: /auth/<encoded-destination> (only for actual encoded URLs, not query params)
    // This handles the mistaken UI redirect /api/auth/<encoded> but not /auth/finish?to=...
    if (normalizedPath.startsWith("/auth/") && normalizedPath !== "/auth/config" && !normalizedPath.startsWith("/auth/finish")) {
      const encoded = normalizedPath.slice("/auth/".length);
      // Only redirect if it looks like a URL (contains ://)
      if (encoded && (encoded.includes("%3A%2F%2F") || encoded.includes("://"))) {
        return Response.redirect(decodeURIComponent(encoded), 302);
      }
    }

    // Auth config route - returns environment-specific auth configuration
    if (normalizedPath === "/auth/config") {
      const authConfig = config.isLocal
        ? {
            environment: 'local',
            authRequired: false,
            teamDomain: null,
            policyAud: null
          }
        : {
            environment: 'production',
            authRequired: true,
            teamDomain: env.TEAM_DOMAIN,
            policyAud: env.POLICY_AUD
          };
      
      return new Response(JSON.stringify(authConfig), {
        headers: withCorsHeaders({
          "Content-Type": "application/json"
        }, allowedOrigin)
      });
    }

    // Tiny fast-path for the connecting probe
    if (normalizedPath === "/ping") {
      const finishUrl = url.searchParams.get("finish");
      
      // In local development, always return success
      if (config.isLocal) {
        if (finishUrl) {
          return Response.redirect(finishUrl, 302);
        }
        return new Response(JSON.stringify({
          ok: true,
          worker: "grassrootsmvt",
          environment: config.environment,
          timestamp: Date.now(),
          auth: 'bypassed'
        }), { 
          status: 200,
          headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin)
        });
      }
      
      // Production behavior - check for Access authentication
      const hasCfAuth = request.headers.get("Cookie")?.includes("CF_Authorization=");
      
      if (hasCfAuth && finishUrl) {
        // Already authenticated, redirect to finish URL
        return Response.redirect(finishUrl, 302);
      } else if (hasCfAuth) {
        // Already authenticated, normal ping response
        return new Response(JSON.stringify({
          ok: true,
          worker: "grassrootsmvt",
          environment: config.environment,
          timestamp: Date.now()
        }), { 
          status: 200,
          headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin)
        });
      }
      // else: fall through; Access will intercept and 302 to team domain.
    }

    // Error logging endpoint - public endpoint for debugging Access URL issues
    if (normalizedPath === "/error-log" && request.method === "POST") {
      try {
        const body = await request.json();
        const timestamp = new Date().toISOString();
        
        // Log to Cloudflare Worker console for immediate debugging
        console.log(`[ERROR-LOG ${timestamp}]`, JSON.stringify({
          sessionId: body.sessionId,
          logCount: body.logs?.length || 0,
          userAgent: body.meta?.userAgent,
          location: body.meta?.location,
          logs: body.logs || []
        }, null, 2));

        // Check for critical AUD-in-path patterns
        const audInPathLogs = (body.logs || []).filter(log => log.patterns?.isAudInPath);
        const status404Logs = (body.logs || []).filter(log => log.status === 404);
        
        if (audInPathLogs.length > 0) {
          console.error(`🚨 CRITICAL: ${audInPathLogs.length} AUD-in-path URLs detected:`, audInPathLogs);
        }
        
        if (status404Logs.length > 0) {
          console.error(`🚨 Access 404 errors detected:`, status404Logs);
        }

        return new Response(JSON.stringify({
          ok: true,
          received: body.logs?.length || 0,
          timestamp: timestamp,
          audInPathDetected: audInPathLogs.length,
          status404Detected: status404Logs.length
        }), {
          headers: withCorsHeaders({
            "Content-Type": "application/json"
          }, allowedOrigin)
        });
      } catch (error) {
        console.error('Error logging endpoint failed:', error);
        return new Response(JSON.stringify({
          ok: false,
          error: 'Failed to process error logs'
        }), {
          status: 500,
          headers: withCorsHeaders({
            "Content-Type": "application/json"
          }, allowedOrigin)
        });
      }
    }

    if (normalizedPath === "/whoami") {
      // Require valid Access session in production, never return dev stub
      try {
        const { ok, email, details } = await verifyAccessJWTOrFail(request, env);
        if (!ok) {
          return new Response(JSON.stringify({ ok: false, error: "unauthorized", details }), {
            status: 401,
            headers: withCorsHeaders({ "Content-Type": "application/json" }, getOrigin())
          });
        }
        return new Response(JSON.stringify({ ok: true, email }), {
          headers: withCorsHeaders({ "Content-Type": "application/json" }, getOrigin())
        });
      } catch (err) {
        // In production: 401 so the UI can send the browser to /auth/finish
        return new Response(JSON.stringify({ 
          ok: false, 
          error: "unauthorized", 
          details: err.message 
        }), {
          status: 401,
          headers: withCorsHeaders({ "Content-Type": "application/json" }, getOrigin())
        });
      }
    }

    // � Volunteer & Call Logging API

    if (normalizedPath === '/voters') {
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

    if (normalizedPath === '/call' && request.method === 'POST') {
      try {
        const user = await authenticateRequest(request, env);
        const email = user.email;
        const requestBody = await request.json();

        const db = env.d1;

        // Check if this is a request to get next voter (has filters) or log a call (has voter_id)
        if (requestBody.filters !== undefined || requestBody.exclude_ids !== undefined) {
          // Get next voter request
          const { filters = {}, exclude_ids = [] } = requestBody;
          
          // Build query to get next available voter using proper table joins
          let query = `SELECT v.voter_id, 
                              COALESCE(va.fn, '') as first_name, 
                              COALESCE(va.ln, '') as last_name, 
                              COALESCE(bp.phone_e164, '') as phone_1,
                              '' as phone_2,
                              v.county, 
                              COALESCE(va.city, '') as city, 
                              v.political_party
                       FROM voters v
                       LEFT JOIN voters_addr_norm va ON v.voter_id = va.voter_id
                       LEFT JOIN best_phone bp ON v.voter_id = bp.voter_id
                       WHERE 1=1`;
          const params = [];
          let paramIndex = 1;

          // Apply filters
          if (filters.county) {
            query += ` AND v.county = ?${paramIndex}`;
            params.push(filters.county);
            paramIndex++;
          }
          if (filters.city) {
            query += ` AND va.city = ?${paramIndex}`;
            params.push(filters.city);
            paramIndex++;
          }
          if (filters.parties && filters.parties.length > 0) {
            const partyPlaceholders = filters.parties.map(() => `?${paramIndex++}`).join(',');
            query += ` AND v.political_party IN (${partyPlaceholders})`;
            params.push(...filters.parties);
          }
          if (filters.require_phone) {
            query += ` AND (bp.phone_e164 IS NOT NULL AND bp.phone_e164 != '')`;
          }

          // Exclude already seen voters
          if (exclude_ids.length > 0) {
            const excludePlaceholders = exclude_ids.map(() => `?${paramIndex++}`).join(',');
            query += ` AND v.voter_id NOT IN (${excludePlaceholders})`;
            params.push(...exclude_ids);
          }

          query += ` ORDER BY RANDOM() LIMIT 1`;

          const result = await db.prepare(query).bind(...params).first();

          if (result) {
            return new Response(
              JSON.stringify({
                ok: true,
                voter_id: result.voter_id,
                first_name: result.first_name,
                last_name: result.last_name,
                phone_1: result.phone_1,
                phone_2: result.phone_2,
                county: result.county,
                city: result.city,
                political_party: result.political_party
              }),
              { status: 200, headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin) }
            );
          } else {
            return new Response(
              JSON.stringify({
                ok: true,
                empty: true,
                message: 'No eligible voters found'
              }),
              { status: 200, headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin) }
            );
          }
          
        } else {
          // Log call result request
          const { voter_id, call_result, notes } = requestBody;

          // Map to actual database schema: call_result -> outcome, notes -> payload_json
          await db.prepare(
            `INSERT INTO call_activity (ts, voter_id, volunteer_email, outcome, payload_json)
             VALUES (datetime('now'), ?1, ?2, ?3, ?4)`
          ).bind(voter_id, email, call_result || 'contacted', JSON.stringify({ notes: notes || '' })).run();

          return new Response(
            JSON.stringify({
              ok: true,
              message: 'Call logged successfully',
              volunteer: email
            }),
            { status: 200, headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin) }
          );
        }

      } catch (error) {
        return new Response(
          JSON.stringify({ ok: false, error: error.message }),
          { status: 401, headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin) }
        );
      }
    }

    if (normalizedPath === '/canvass' && request.method === 'POST') {
      // Log canvassing activity from volunteer
      try {
        const user = await authenticateRequest(request, env);
        const email = user.email;
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

    if (normalizedPath === '/streets' && request.method === 'POST') {
      // Get all unique streets for a county/city combination - optimized for autocomplete
      try {
        const user = await authenticateRequest(request, env);
        const { county, city } = await request.json();

        if (!county || !city) {
          return new Response(
            JSON.stringify({ ok: false, error: 'county and city are required' }),
            { status: 400, headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin) }
          );
        }

        const db = env.d1;
        
        // Optimized query to get all unique streets for a county/city
        // Extract street name by removing house number from addr1
        const streetsQuery = `
          SELECT DISTINCT 
                 UPPER(TRIM(SUBSTR(va.addr1, INSTR(va.addr1, ' ') + 1))) as street_name,
                 COUNT(*) as voter_count
          FROM voters v
          JOIN voters_addr_norm va ON v.voter_id = va.voter_id
          WHERE v.county = ?1 
            AND va.city = ?2
            AND va.addr1 IS NOT NULL 
            AND va.addr1 != ''
            AND INSTR(va.addr1, ' ') > 0
            AND LENGTH(TRIM(SUBSTR(va.addr1, INSTR(va.addr1, ' ') + 1))) > 0
          GROUP BY UPPER(TRIM(SUBSTR(va.addr1, INSTR(va.addr1, ' ') + 1)))
          ORDER BY street_name
        `;

        const result = await db.prepare(streetsQuery).bind(county, city).all();
        
        const streets = (result.results || []).map(row => ({
          name: row.street_name,
          count: row.voter_count
        }));

        return new Response(
          JSON.stringify({
            ok: true,
            county: county,
            city: city,
            streets: streets,
            total: streets.length
          }),
          { 
            headers: withCorsHeaders({ 
              "Content-Type": "application/json",
              "Cache-Control": "max-age=3600" // Cache for 1 hour since streets don't change often
            }, allowedOrigin)
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

    if (normalizedPath === '/canvass/nearby' && request.method === 'POST') {
      // Find nearby addresses for door-to-door canvassing
      try {
        const user = await authenticateRequest(request, env);
        const { filters = {}, house, street, range = 20, limit = 20 } = await request.json();

        const db = env.d1;
        
        // Build query to find voters on the same street within house number range
        let query = `SELECT v.voter_id, 
                            COALESCE(va.fn, '') as first_name, 
                            COALESCE(va.ln, '') as last_name, 
                            COALESCE(va.addr1, '') as address,
                            COALESCE(va.city, '') as city, 
                            COALESCE(va.zip, '') as zip,
                            v.county, 
                            v.political_party as party,
                            COALESCE(bp.phone_e164, '') as phone_e164,
                            bp.confidence_code as phone_confidence
                     FROM voters v
                     LEFT JOIN voters_addr_norm va ON v.voter_id = va.voter_id
                     LEFT JOIN best_phone bp ON v.voter_id = bp.voter_id
                     WHERE 1=1`;
        const params = [];
        let paramIndex = 1;

        // Apply geographic filters
        if (street) {
          query += ` AND UPPER(va.addr1) LIKE '%' || ?${paramIndex} || '%'`;
          params.push(street.toUpperCase());
          paramIndex++;
        }

        // Apply demographic filters from URL parameters
        if (filters.county) {
          query += ` AND v.county = ?${paramIndex}`;
          params.push(filters.county);
          paramIndex++;
        }
        if (filters.parties && filters.parties.length > 0) {
          const partyPlaceholders = filters.parties.map(() => `?${paramIndex++}`).join(',');
          query += ` AND v.political_party IN (${partyPlaceholders})`;
          params.push(...filters.parties);
        }

        // If house number is provided, try to find nearby house numbers
        if (house && range) {
          query += ` AND va.addr1 IS NOT NULL AND va.addr1 != ''`;
          // This is a simplified approach - in production you'd want more sophisticated address parsing
        }

        query += ` ORDER BY v.voter_id LIMIT ?${paramIndex}`;
        params.push(Math.min(limit, 100)); // Cap at 100 for performance

        const result = await db.prepare(query).bind(...params).all();
        
        // Format results for canvass UI
        const rows = (result.results || []).map(row => ({
          voter_id: row.voter_id,
          name: [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Unknown',
          address: row.address || 'Address unknown',
          city: row.city || '',
          zip: row.zip || '',
          party: row.party || '',
          phone_e164: row.phone_e164 || null,
          phone_confidence: row.phone_confidence || null
        }));

        return new Response(
          JSON.stringify({
            ok: true,
            rows: rows,
            total: rows.length,
            filters_applied: filters
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

    if (normalizedPath === '/complete' && request.method === 'POST') {
      // Enhanced call/canvass completion endpoint with email collection
      try {
        const user = await authenticateRequest(request, env);
        const email = user.email;
        const callData = await request.json();
        
        console.log('📞 Received call completion data:', callData);
        
        const {
          voter_id,
          outcome,
          ok_callback = false,
          requested_info = false,
          dnc = false,
          best_day = null,
          best_time_window = null,
          optin_sms = false,
          optin_email = false,
          email: voterEmail = null,
          wants_volunteer = false,
          share_insights_ok = false,
          for_term_limits = false,
          issue_public_lands = false,
          comments = null
        } = callData;

        // Map frontend outcome values to database result values
        const resultMap = {
          'connected': 'Contacted',
          'vm': 'Contacted',
          'no_answer': 'Not Home', 
          'wrong_number': 'Wrong Number',
          'refused': 'Refused',
          'follow_up': 'Follow Up',
          'dnc': 'Do Not Contact'
        };
        
        const mappedResult = resultMap[outcome] || 'Contacted';

        const db = env.d1;
        
        // Log in canvass_activity for backwards compatibility
        await db.prepare(
          `INSERT INTO canvass_activity 
           (voter_id, volunteer_email, result, notes, pulse_opt_in, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))`
        ).bind(
          voter_id, 
          email, 
          mappedResult, 
          comments || '', 
          (optin_email || optin_sms) ? 1 : 0
        ).run();

        // If email is provided, store it in the voter_emails table
        if (voterEmail && voterEmail.trim()) {
          try {
            await db.prepare(`
              INSERT OR REPLACE INTO voter_emails (
                voter_id, email, email_verified, opt_in_status, source, collected_by, collected_at, last_updated
              ) VALUES (
                ?1, ?2, 0, ?3, 'phone_call', ?4, datetime('now'), datetime('now')
              )
            `).bind(
              voter_id,
              voterEmail.trim(),
              optin_email ? 'opted_in' : 'unknown',
              email
            ).run();
            console.log('📧 Email stored in voter_emails table from call:', voterEmail);
          } catch (emailError) {
            console.warn('Failed to store email in voter_emails table:', emailError);
            // Continue execution - don't fail the whole call if email storage fails
          }
        }

        return new Response(
          JSON.stringify({
            ok: true,
            message: 'Call completed successfully',
            voter_id: voter_id,
            volunteer: email,
            outcome: outcome,
            email_collected: !!voterEmail
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

    if (normalizedPath === '/contact-staging' && request.method === 'POST') {
      // NEW: Handle new voter contact submissions for staging system
      try {
        const user = await authenticateRequest(request, env);
        const volunteer_email = user.email;
        const contactData = await request.json();
        
        console.log('📝 Received staging contact data:', contactData);
        
        const {
          county,
          city,
          streetName,
          houseNumber,
          firstName,
          lastName,
          middleName,
          suffix,
          fullAddress,
          unitNumber,
          zipCode,
          phonePrimary,
          email,
          estimatedParty,
          votingLikelihood,
          contactMethod,
          interactionNotes,
          issuesInterested,
          volunteerNotes
        } = contactData;

        // Validate required fields for staging
        if (!county || !city || !firstName || !lastName) {
          return new Response(
            JSON.stringify({ ok: false, error: 'county, city, firstName, and lastName are required' }),
            { status: 400, headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin) }
          );
        }

        const db = env.d1;
        
        // Insert into voter_contact_staging table
        const result = await db.prepare(`
          INSERT INTO voter_contact_staging (
            submitted_by, vol_email, search_county, search_city, search_street_name, search_house_number,
            fn, ln, middle_name, suffix, addr1, house_number, street_name, unit_number,
            city, county, state, zip, phone_e164, email, political_party, voting_likelihood,
            contact_method, interaction_notes, issues_interested, volunteer_notes, created_at
          ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, datetime('now')
          )
        `).bind(
          volunteer_email,
          volunteer_email,
          county,
          city,
          streetName || '',
          houseNumber || '',
          firstName,
          lastName,
          middleName || '',
          suffix || '',
          fullAddress || `${houseNumber || ''} ${streetName || ''}`.trim(),
          houseNumber || '',
          streetName || '',
          unitNumber || '',
          city,
          county,
          'WY',
          zipCode || '',
          phonePrimary || '',
          email || '',
          estimatedParty || '',
          votingLikelihood || 'unknown',
          contactMethod || 'door',
          interactionNotes || '',
          issuesInterested || '',
          volunteerNotes || ''
        ).run();

        return new Response(
          JSON.stringify({
            ok: true,
            message: 'Contact submitted to staging successfully',
            staging_id: result.meta.last_row_id,
            volunteer: volunteer_email,
            status: 'pending_verification'
          }),
          { 
            headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin)
          }
        );
      } catch (error) {
        console.error('Error submitting staging contact:', error);
        return new Response(
          JSON.stringify({ ok: false, error: error.message }),
          { 
            status: 500,
            headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin)
          }
        );
      }
    }

    if (normalizedPath === '/contact' && request.method === 'POST') {
      // Enhanced contact recording with rich data collection (for existing voters)
      try {
        const user = await authenticateRequest(request, env);
        const volunteer_email = user.email;
        const contactData = await request.json();
        
        console.log('📋 Received contact data:', contactData);
        
        const {
          voter_id,
          method = 'door',
          outcome,
          wants_volunteer = false,
          wants_updates = false,
          ok_callback = false,
          requested_info = false,
          email = null,
          optin_email = false,
          optin_sms = false,
          for_term_limits = false,
          issue_public_lands = false,
          comments = null
        } = contactData;

        // Validate required fields
        if (!voter_id || !outcome) {
          return new Response(
            JSON.stringify({ ok: false, error: 'voter_id and outcome are required' }),
            { status: 400, headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin) }
          );
        }

        const db = env.d1;
        
        // Insert into voter_contacts table with rich data
        await db.prepare(`
          INSERT INTO voter_contacts (
            voter_id, volunteer_id, method, outcome,
            ok_callback, requested_info, dnc, 
            optin_sms, optin_email, email,
            wants_volunteer, for_term_limits, issue_public_lands,
            comments, created_at
          ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, datetime('now')
          )
        `).bind(
          voter_id,
          volunteer_email,
          method,
          outcome,
          ok_callback ? 1 : 0,
          requested_info ? 1 : 0,
          outcome === 'dnc' ? 1 : 0, // Set DNC flag if outcome is dnc
          optin_sms ? 1 : 0,
          optin_email ? 1 : 0,
          email,
          wants_volunteer ? 1 : 0,
          for_term_limits ? 1 : 0,
          issue_public_lands ? 1 : 0,
          comments
        ).run();

        // If email is provided, store it in the voter_emails table
        if (email && email.trim()) {
          try {
            await db.prepare(`
              INSERT OR REPLACE INTO voter_emails (
                voter_id, email, email_verified, opt_in_status, source, collected_by, collected_at, last_updated
              ) VALUES (
                ?1, ?2, 0, ?3, 'contact_form', ?4, datetime('now'), datetime('now')
              )
            `).bind(
              voter_id,
              email.trim(),
              optin_email ? 'opted_in' : 'unknown',
              volunteer_email
            ).run();
            console.log('📧 Email stored in voter_emails table:', email);
          } catch (emailError) {
            console.warn('Failed to store email in voter_emails table:', emailError);
            // Continue execution - don't fail the whole contact if email storage fails
          }
        }

        // Also log in canvass_activity for backwards compatibility
        const resultMap = {
          'connected': 'Contacted',
          'brief': 'Contacted',
          'info_left': 'Contacted',
          'not_interested': 'Contacted',
          'no_answer': 'Not Home',
          'refused': 'Refused',
          'wrong_address': 'Moved',
          'dnc': 'Do Not Contact'
        };
        
        const mappedResult = resultMap[outcome] || 'Contacted';
        
        await db.prepare(
          `INSERT INTO canvass_activity 
           (voter_id, volunteer_email, result, notes, pulse_opt_in, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))`
        ).bind(
          voter_id, 
          volunteer_email, 
          mappedResult, 
          comments || '', 
          (optin_email || optin_sms) ? 1 : 0
        ).run();

        return new Response(
          JSON.stringify({
            ok: true,
            message: 'Contact recorded successfully',
            voter_id: voter_id,
            volunteer: volunteer_email,
            outcome: outcome,
            rich_data_captured: true
          }),
          { 
            headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin)
          }
        );
      } catch (error) {
        console.error('Error recording contact:', error);
        return new Response(
          JSON.stringify({ ok: false, error: error.message }),
          { 
            status: 500,
            headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin)
          }
        );
      }
    }

    if (normalizedPath === '/contact/status' && request.method === 'GET') {
      // Get contact status for voters (for canvass page display)
      try {
        const user = await authenticateRequest(request, env);
        const voter_ids = url.searchParams.get('voter_ids')?.split(',') || [];
        
        if (!voter_ids.length || voter_ids.length > 50) {
          return new Response(
            JSON.stringify({ ok: false, error: 'voter_ids parameter required (max 50 IDs)' }),
            { status: 400, headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin) }
          );
        }

        const db = env.d1;
        
        // Get latest contact for each voter from both tables
        const placeholders = voter_ids.map(() => '?').join(',');
        
        // Query voter_contacts for rich contact data
        const contactQuery = `
          SELECT 
            voter_id,
            volunteer_id as volunteer_email,
            method,
            outcome,
            created_at,
            'voter_contacts' as source
          FROM voter_contacts 
          WHERE voter_id IN (${placeholders})
          ORDER BY created_at DESC
        `;
        
        // Query canvass_activity for basic contact data
        const canvassQuery = `
          SELECT 
            voter_id,
            volunteer_email,
            'door' as method,
            result as outcome,
            created_at,
            'canvass_activity' as source
          FROM canvass_activity 
          WHERE voter_id IN (${placeholders})
          ORDER BY created_at DESC
        `;
        
        const [contactResults, canvassResults] = await Promise.all([
          db.prepare(contactQuery).bind(...voter_ids).all(),
          db.prepare(canvassQuery).bind(...voter_ids).all()
        ]);
        
        // Combine and find latest contact per voter
        const allContacts = [...contactResults.results, ...canvassResults.results];
        const latestContacts = {};
        
        for (const contact of allContacts) {
          const voterId = contact.voter_id;
          if (!latestContacts[voterId] || contact.created_at > latestContacts[voterId].created_at) {
            latestContacts[voterId] = contact;
          }
        }
        
        return new Response(
          JSON.stringify({
            ok: true,
            contacts: latestContacts
          }),
          { headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin) }
        );
        
      } catch (error) {
        console.error('Error fetching contact status:', error);
        return new Response(
          JSON.stringify({ ok: false, error: error.message }),
          { 
            status: error.message.includes('JWT') ? 401 : 500,
            headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin)
          }
        );
      }
    }

    if (normalizedPath === '/pulse' && request.method === 'POST') {
      // Track pulse opt-ins (text/email consent)
      try {
        const { voter_id, contact_method, consent_source } = await request.json();
        
        // Volunteer email is optional for this endpoint
        let volunteer_email = null;
        try {
          const user = await authenticateRequest(request, env);
          volunteer_email = user.email;
        } catch (authError) {
          // Continue without volunteer email if auth fails (for public forms)
          if (config.debug) {
            console.log('No authentication provided for pulse opt-in, continuing without volunteer email');
          }
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

    if (normalizedPath === '/activity') {
      // Return recent call activity by authenticated volunteer
      try {
        const user = await authenticateRequest(request, env);
        const email = user.email;

        const db = env.d1;
        const result = await db.prepare(
          `SELECT * FROM call_activity WHERE volunteer_email = ?1 ORDER BY ts DESC LIMIT 10;`
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
    if (normalizedPath === '/metadata') {
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
    if (normalizedPath === '/templates') {
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
    if (normalizedPath === '/db/tables') {
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
    if (normalizedPath === '/db/schema' && url.searchParams.get('table')) {
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

    // NEW: Contact staging endpoint for new voter submissions
    if (normalizedPath === '/contact-staging' && request.method === 'POST') {
      try {
        const user = await authenticateRequest(request, env);
        const volunteer_email = user.email;
        const stagingData = await request.json();
        
        console.log('📝 Received staging contact data:', stagingData);
        
        const {
          county,
          city,
          streetName,
          houseNumber,
          firstName,
          lastName,
          middleName = null,
          suffix = null,
          fullAddress,
          unitNumber = null,
          zipCode = null,
          phonePrimary = null,
          estimatedParty = null,
          votingLikelihood = 'unknown',
          contactMethod = 'door',
          interactionNotes = null,
          issuesInterested = null,
          volunteerNotes = null,
          volEmail
        } = stagingData;

        // Validate required fields
        if (!county || !city || !firstName || !lastName || !fullAddress) {
          return new Response(
            JSON.stringify({ 
              ok: false, 
              error: 'County, city, firstName, lastName, and fullAddress are required' 
            }),
            { status: 400, headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin) }
          );
        }

        const db = env.d1;
        
        // Insert into voter_contact_staging table
        const result = await db.prepare(`
          INSERT INTO voter_contact_staging (
            submitted_by, vol_email, search_county, search_city, 
            search_street_name, search_house_number,
            fn, ln, middle_name, suffix,
            addr1, house_number, street_name, unit_number,
            city, county, state, zip,
            phone_e164, political_party, voting_likelihood,
            contact_method, interaction_notes, issues_interested,
            volunteer_notes, status, created_at, updated_at
          ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
            ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20,
            ?21, ?22, ?23, ?24, ?25, 'pending', datetime('now'), datetime('now')
          )
        `).bind(
          volunteer_email,           // submitted_by
          volEmail || volunteer_email, // vol_email
          county,                    // search_county
          city,                      // search_city
          streetName,                // search_street_name
          houseNumber,               // search_house_number
          firstName,                 // fn
          lastName,                  // ln
          middleName,                // middle_name
          suffix,                    // suffix
          fullAddress,               // addr1
          houseNumber,               // house_number
          streetName,                // street_name
          unitNumber,                // unit_number
          city,                      // city
          county,                    // county
          'WY',                      // state
          zipCode,                   // zip
          phonePrimary,              // phone_e164
          estimatedParty,            // political_party
          votingLikelihood,          // voting_likelihood
          contactMethod,             // contact_method
          interactionNotes,          // interaction_notes
          issuesInterested,          // issues_interested
          volunteerNotes             // volunteer_notes
        ).run();

        return new Response(
          JSON.stringify({ 
            ok: true, 
            message: 'Contact submitted for verification',
            staging_id: result.meta.last_row_id,
            temp_voter_id: `TEMP-${String(result.meta.last_row_id).padStart(8, '0')}`
          }),
          { status: 200, headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin) }
        );

      } catch (error) {
        console.error('Contact staging error:', error);
        return new Response(
          JSON.stringify({
            ok: false,
            error: 'Failed to submit contact for verification: ' + error.message
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
