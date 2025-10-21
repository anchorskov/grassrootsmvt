// worker/src/routes/next.js
// Get next voter for calling with exclude list to avoid repeats

export default {
  path: '/api/next',
  method: ['POST'],
  async handler(req, env) {
    try {
      const body = await req.json().catch(() => ({}));
      const { filters = {}, exclude_ids = [] } = body;
      
      console.log('📞 Next voter request:', { filters, exclude_count: exclude_ids.length });

      // Fallback data for development
      const fallbackVoters = [
        {
          voter_id: 'DEV001',
          first_name: 'John',
          last_name: 'Doe',
          ra_city: 'CASPER',
          ra_zip: '82601',
          party: 'Republican',
          phone_e164: '+13075551234'
        },
        {
          voter_id: 'DEV002',
          first_name: 'Jane',
          last_name: 'Smith',
          ra_city: 'LARAMIE',
          ra_zip: '82070',
          party: 'Democrat',
          phone_e164: '+13075555678'
        },
        {
          voter_id: 'DEV003',
          first_name: 'Bob',
          last_name: 'Wilson',
          ra_city: 'CHEYENNE',
          ra_zip: '82001',
          party: 'Unaffiliated',
          phone_e164: '+13075559012'
        }
      ];

      if (!env.d1) {
        console.log('📞 No D1 database, returning fallback voter');
        // Return a voter not in exclude list
        const available = fallbackVoters.filter(v => !exclude_ids.includes(v.voter_id));
        const voter = available.length > 0 ? available[0] : null;
        
        if (!voter) {
          return new Response(JSON.stringify({
            ok: true,
            empty: true
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({
          ok: true,
          ...voter
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // D1 database query
      try {
        // Build WHERE clause based on filters
        let whereConditions = ['vp.phone_e164 IS NOT NULL']; // Require phone for calling
        let bindParams = [];

        if (filters.county) {
          whereConditions.push('UPPER(v.county) = UPPER(?)');
          bindParams.push(filters.county);
        }

        if (filters.city) {
          whereConditions.push('UPPER(va.city) = UPPER(?)');
          bindParams.push(filters.city);
        }

        if (filters.parties && filters.parties.length > 0) {
          const partyPlaceholders = filters.parties.map(() => '?').join(',');
          whereConditions.push(`v.political_party IN (${partyPlaceholders})`);
          bindParams.push(...filters.parties);
        }

        // Exclude previously seen voters
        if (exclude_ids.length > 0) {
          const excludePlaceholders = exclude_ids.map(() => '?').join(',');
          whereConditions.push(`v.voter_id NOT IN (${excludePlaceholders})`);
          bindParams.push(...exclude_ids);
        }

        const query = `
          SELECT 
            v.voter_id,
            va.fn as first_name,
            va.ln as last_name,
            va.city as ra_city,
            va.zip as ra_zip,
            v.political_party as party,
            vp.phone_e164
          FROM voters v
          JOIN v_voters_addr_norm va ON v.voter_id = va.voter_id
          JOIN v_best_phone vp ON v.voter_id = vp.voter_id
          WHERE ${whereConditions.join(' AND ')}
          ORDER BY RANDOM()
          LIMIT 1
        `;

        console.log('📞 Executing next voter query with filters:', { 
          county: filters.county, 
          city: filters.city, 
          parties: filters.parties,
          excludeCount: exclude_ids.length 
        });

        const stmt = env.d1.prepare(query).bind(...bindParams);
        const result = await stmt.first();

        if (!result) {
          console.log('📞 No eligible voters found');
          return new Response(JSON.stringify({
            ok: true,
            empty: true
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }

        console.log(`📞 Found voter: ${result.first_name} ${result.last_name} (${result.voter_id})`);

        return new Response(JSON.stringify({
          ok: true,
          voter_id: result.voter_id,
          first_name: result.first_name,
          last_name: result.last_name,
          ra_city: result.ra_city,
          ra_zip: result.ra_zip,
          party: result.party,
          phone_e164: result.phone_e164
        }), {
          headers: { 'Content-Type': 'application/json' }
        });

      } catch (dbError) {
        console.error('📞 Database error:', dbError);
        
        // Return fallback data on database error
        const available = fallbackVoters.filter(v => !exclude_ids.includes(v.voter_id));
        const voter = available.length > 0 ? available[0] : null;
        
        if (!voter) {
          return new Response(JSON.stringify({
            ok: true,
            empty: true,
            fallback: true
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({
          ok: true,
          ...voter,
          fallback: true,
          error: 'Database temporarily unavailable'
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

    } catch (error) {
      console.error('📞 Next voter error:', error);
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