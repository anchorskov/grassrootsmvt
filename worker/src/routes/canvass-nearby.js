// worker/src/routes/canvass-nearby.js
// Canvass nearby addresses endpoint
// Finds voters near a specific house number and street for canvassing

export default {
  path: '/api/canvass/nearby',
  method: ['POST'],
  async handler(req, env) {
    try {
      const body = await req.json().catch(() => ({}));
      const { filters = {}, street, house, range = 20, limit = 50 } = body;
      
      console.log('🏘️ Canvass nearby request:', { filters, street, house, range, limit });

      // Validate required parameters
      if (!street) {
        return new Response(JSON.stringify({
          ok: false,
          error: 'Missing required parameter: street'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Handle case where house is not provided (get all houses on street)
      let houseNum = null;
      if (house) {
        houseNum = parseInt(house, 10);
        if (isNaN(houseNum)) {
          return new Response(JSON.stringify({
            ok: false,
            error: 'House number must be a valid number'
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      // Fallback data for development
      const fallbackData = houseNum ? [
        {
          voter_id: 'DEV001',
          name: 'John Doe',
          address: `${houseNum} ${street}`,
          city: filters.city || 'CASPER',
          zip: '82601',
          party: 'Republican',
          phone_e164: '+13075551234'
        },
        {
          voter_id: 'DEV002',
          name: 'Jane Smith',
          address: `${houseNum + 2} ${street}`,
          city: filters.city || 'CASPER',
          zip: '82601',
          party: 'Democrat',
          phone_e164: null
        }
      ] : [
        {
          voter_id: 'DEV001',
          name: 'John Doe',
          address: `100 ${street}`,
          city: filters.city || 'CASPER',
          zip: '82601',
          party: 'Republican',
          phone_e164: '+13075551234'
        },
        {
          voter_id: 'DEV002',
          name: 'Jane Smith',
          address: `102 ${street}`,
          city: filters.city || 'CASPER',
          zip: '82601',
          party: 'Democrat',
          phone_e164: null
        },
        {
          voter_id: 'DEV003',
          name: 'Bob Wilson',
          address: `104 ${street}`,
          city: filters.city || 'CASPER',
          zip: '82601',
          party: 'Unaffiliated',
          phone_e164: null
        }
      ];

      if (!env.d1) {
        console.log('🏘️ No D1 database, returning fallback data');
        return new Response(JSON.stringify({
          ok: true,
          rows: fallbackData.slice(0, limit)
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // D1 database query
      try {
        const rangeValue = parseInt(range, 10) || 20;
        const limitValue = Math.min(parseInt(limit, 10) || 50, 100);
        
        let query, bindParams;
        
        if (houseNum) {
          // Find voters near a specific house number
          query = `
            SELECT DISTINCT
              va.voter_id,
              COALESCE(va.fn || ' ' || va.ln, 'Name Unknown') as name,
              va.addr1 as address,
              va.city,
              va.zip,
              v.political_party as party,
              vp.phone_e164
            FROM v_voters_addr_norm va
            JOIN voters v ON va.voter_id = v.voter_id
            LEFT JOIN v_best_phone vp ON v.voter_id = vp.voter_id
            WHERE va.addr1 IS NOT NULL
              AND va.addr1 != ''
              AND UPPER(va.addr1) LIKE '%' || UPPER(?) || '%'
              AND CAST(SUBSTR(va.addr1, 1, INSTR(va.addr1 || ' ', ' ') - 1) AS INTEGER) 
                  BETWEEN ? AND ?
              AND (?4 IS NULL OR UPPER(va.city) = UPPER(?4))
              AND (?5 IS NULL OR UPPER(v.county) = UPPER(?5))
            ORDER BY 
              CAST(SUBSTR(va.addr1, 1, INSTR(va.addr1 || ' ', ' ') - 1) AS INTEGER),
              va.ln,
              va.fn
            LIMIT ?
          `;
          
          bindParams = [
            street,                           // Street name
            houseNum - rangeValue,           // Min house number
            houseNum + rangeValue,           // Max house number  
            filters.city || null,            // City filter
            filters.county || null,          // County filter
            limitValue                       // Limit
          ];
        } else {
          // Get all house numbers on a street (for house number suggestions)
          query = `
            SELECT DISTINCT
              va.voter_id,
              COALESCE(va.fn || ' ' || va.ln, 'Name Unknown') as name,
              va.addr1 as address,
              va.city,
              va.zip,
              v.political_party as party,
              vp.phone_e164
            FROM v_voters_addr_norm va
            JOIN voters v ON va.voter_id = v.voter_id
            LEFT JOIN v_best_phone vp ON v.voter_id = vp.voter_id
            WHERE va.addr1 IS NOT NULL
              AND va.addr1 != ''
              AND UPPER(va.addr1) LIKE '%' || UPPER(?) || '%'
              AND (?2 IS NULL OR UPPER(va.city) = UPPER(?2))
              AND (?3 IS NULL OR UPPER(v.county) = UPPER(?3))
            ORDER BY 
              CAST(SUBSTR(va.addr1, 1, INSTR(va.addr1 || ' ', ' ') - 1) AS INTEGER),
              va.ln,
              va.fn
            LIMIT ?
          `;
          
          bindParams = [
            street,                          // Street name
            filters.city || null,            // City filter
            filters.county || null,          // County filter
            limitValue                       // Limit
          ];
        }

        console.log('🏘️ Executing D1 query with params:', {
          street,
          house: houseNum,
          minHouse: houseNum ? houseNum - rangeValue : 'N/A',
          maxHouse: houseNum ? houseNum + rangeValue : 'N/A',
          city: filters.city,
          county: filters.county,
          limit: limitValue
        });

        const stmt = env.d1.prepare(query).bind(...bindParams);
        const result = await stmt.all();
        const rows = result.results || [];

        console.log(`🏘️ Found ${rows.length} voters ${houseNum ? `near ${house}` : 'on'} ${street}`);

        return new Response(JSON.stringify({
          ok: true,
          rows: rows,
          total: rows.length
        }), {
          headers: { 'Content-Type': 'application/json' }
        });

      } catch (dbError) {
        console.error('🏘️ Database error:', dbError);
        
        // Return fallback data on database error
        return new Response(JSON.stringify({
          ok: true,
          rows: fallbackData.slice(0, limit),
          fallback: true,
          error: 'Database temporarily unavailable'
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

    } catch (error) {
      console.error('🏘️ Canvass nearby error:', error);
      return new Response(JSON.stringify({
        ok: false,
        error: 'Internal server error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};