// worker/src/routes/contact-status.js
// Contact status endpoint for checking previous contact history

export default {
  path: '/api/contact/status',
  method: ['GET'],
  async handler(req, env) {
    try {
      const url = new URL(req.url);
      const voter_ids = url.searchParams.get('voter_ids');
      
      console.log('📋 Contact status request for voter_ids:', voter_ids);

      if (!voter_ids) {
        return new Response(JSON.stringify({
          ok: false,
          error: 'Missing voter_ids parameter'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Fallback data for development
      const fallbackContacts = {};
      const ids = voter_ids.split(',');
      
      // Simulate some contact history for demo
      if (ids.length > 0) {
        fallbackContacts[ids[0]] = {
          outcome: 'connected',
          volunteer_email: 'volunteer@example.com',
          created_at: '2025-10-20T10:00:00Z'
        };
      }

      if (!env.d1) {
        console.log('📋 No D1 database, returning fallback contact data');
        return new Response(JSON.stringify({
          ok: true,
          contacts: fallbackContacts
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // D1 database query
      try {
        const voterIdList = voter_ids.split(',').map(id => id.trim()).filter(Boolean);
        
        if (voterIdList.length === 0) {
          return new Response(JSON.stringify({
            ok: true,
            contacts: {}
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // Build placeholders for IN clause
        const placeholders = voterIdList.map(() => '?').join(',');
        
        const query = `
          SELECT 
            voter_id,
            outcome,
            volunteer_id as volunteer_email,
            created_at
          FROM voter_contacts 
          WHERE voter_id IN (${placeholders})
          ORDER BY created_at DESC
        `;

        console.log('📋 Executing contact status query for voters:', voterIdList);

        const stmt = env.d1.prepare(query).bind(...voterIdList);
        const result = await stmt.all();
        const rows = result.results || [];

        // Build contacts object with most recent contact per voter
        const contacts = {};
        for (const row of rows) {
          if (!contacts[row.voter_id]) {
            contacts[row.voter_id] = {
              outcome: row.outcome,
              volunteer_email: row.volunteer_email,
              created_at: row.created_at
            };
          }
        }

        console.log(`📋 Found contact history for ${Object.keys(contacts).length} voters`);

        return new Response(JSON.stringify({
          ok: true,
          contacts: contacts
        }), {
          headers: { 'Content-Type': 'application/json' }
        });

      } catch (dbError) {
        console.error('📋 Database error:', dbError);
        
        // Return fallback data on database error
        return new Response(JSON.stringify({
          ok: true,
          contacts: fallbackContacts,
          fallback: true,
          error: 'Database temporarily unavailable'
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

    } catch (error) {
      console.error('📋 Contact status error:', error);
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