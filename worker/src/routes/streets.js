// worker/src/routes/streets.js
// Autocomplete unique street names with optional filters.
// Uses D1 in production; static fallback list in development.

export default {
  path: '/api/streets',
  method: ['GET', 'POST'], // Support both GET and POST
  async handler(req, env) {
    let q, county, city, limit, showAll;

    if (req.method === 'POST') {
      // POST request with JSON body
      try {
        const body = await req.json().catch(() => ({}));
        county = body?.county?.toString().trim() || null;
        city   = body?.city?.toString().trim()   || null;
        q      = body?.q?.toString().trim()      || body?.query?.toString().trim() || '';
        limit  = Math.min(Math.max(parseInt(body?.limit ?? '10', 10) || 10, 1), 100);
        showAll = body?.showAll === true || body?.all === true;
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } else {
      // GET request with query parameters
      const url = new URL(req.url);
      q = (url.searchParams.get('query') ||
           url.searchParams.get('q') ||
           url.searchParams.get('term') ||
           '').trim();
      county = url.searchParams.get('county')?.trim() || null;
      city = url.searchParams.get('city')?.trim() || null;
      limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '10', 10) || 10, 1), 100);
      showAll = url.searchParams.get('showAll') === 'true' || url.searchParams.get('all') === 'true';
    }

    // If no prefix and not requesting all streets, short-circuit with empty result
    if (q.length < 2 && !showAll) {
      return new Response(JSON.stringify({ 
        ok: true, 
        county,
        city,
        streets: [], 
        total: 0,
        results: [] // Legacy compatibility
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const localStreets = [
      '1st St', '2nd St', 'Center St', 'CY Ave', 'Poplar St',
      'Wyoming Blvd', 'Durbin St', 'Collins Dr', 'Midwest Ave',
    ];

    try {
      if (env.d1) { // Use D1 in both development and production if available
        console.log('🔍 D1 database available, attempting query...');
        
        // Build the WHERE clause dynamically based on whether we're showing all or filtering
        let whereClause = `
          WHERE va.addr1 IS NOT NULL
            AND va.addr1 != ''
            AND INSTR(va.addr1, ' ') > 0
            AND LENGTH(TRIM(SUBSTR(va.addr1, INSTR(va.addr1, ' ') + 1))) > 0
            AND (?1 IS NULL OR UPPER(v.county) = UPPER(?1))
            AND (?2 IS NULL OR UPPER(va.city) = UPPER(?2))
        `;
        
        // Add search filter only if we have a query and not showing all
        if (!showAll && q.length > 0) {
          whereClause += ` AND UPPER(TRIM(SUBSTR(va.addr1, INSTR(va.addr1, ' ') + 1))) LIKE UPPER(?3) || '%'`;
        }

        // Prefer normalized table/column if available. Fall back to extracting from addr1.
        // Uses optional filters (county, city) and prefix filter (q).
        const streetsQuery = `
          WITH base AS (
            SELECT DISTINCT
              UPPER(TRIM(SUBSTR(va.addr1, INSTR(va.addr1, ' ') + 1))) AS street_name
            FROM v_voters_addr_norm va
            JOIN voters v ON va.voter_id = v.voter_id
            ${whereClause}
          )
          SELECT DISTINCT street_name
          FROM base
          ORDER BY street_name
          LIMIT ?${showAll || q.length === 0 ? '3' : '4'}
        `;

        // Bind parameters based on whether we're filtering by query
        const stmt = showAll || q.length === 0 
          ? env.d1.prepare(streetsQuery).bind(county, city, limit)
          : env.d1.prepare(streetsQuery).bind(county, city, q.toLowerCase(), limit);
          
        console.log('🔍 Executing D1 query with params:', { county, city, q, limit, showAll });
        const result = await stmt.all();
        console.log('🔍 D1 query result:', result);

        const streets = (result.results || [])
          .map(row => row.street_name)
          .filter(Boolean)
          .map(name => ({ name, label: name })); // Include both name and label for compatibility

        return new Response(
          JSON.stringify({
            ok: true,
            county,
            city,
            streets,
            total: streets.length,
            results: streets // Legacy compatibility
          }),
          { 
            headers: { 
              "Content-Type": "application/json",
              "Cache-Control": "max-age=600"
            }
          }
        );
      }
    } catch (err) {
      console.warn('⚠️ D1 query failed:', err.message);
      console.warn('⚠️ env.d1 available:', !!env.d1);
      console.warn('⚠️ env.ENVIRONMENT:', env.ENVIRONMENT);
      // Fall through to local fallback
    }

    // Local fallback filter (ignore county/city filters since fallback data has no location context)
    const filtered = localStreets
      .filter((s) => s.toLowerCase().includes(q.toLowerCase()))
      .slice(0, limit);
    
    const streets = filtered.map(name => ({ name, label: name }));

    return new Response(JSON.stringify({ 
      ok: true,
      county: null, // Don't return specific county/city for fallback data
      city: null,
      streets,
      total: streets.length,
      results: streets // Legacy compatibility
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
