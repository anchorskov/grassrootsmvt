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
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": env.ALLOW_ORIGIN || "*",
              "Access-Control-Allow-Methods": "GET, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type, Authorization"
            }
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
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": env.ALLOW_ORIGIN || "*"
            },
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
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": env.ALLOW_ORIGIN || "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization"
              }
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
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": env.ALLOW_ORIGIN || "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization"
              }
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
