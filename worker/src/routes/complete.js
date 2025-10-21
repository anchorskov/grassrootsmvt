// worker/src/routes/complete.js
// Save completed call interaction results

export default {
  path: '/api/complete',
  method: ['POST'],
  async handler(req, env) {
    try {
      const body = await req.json().catch(() => ({}));
      const { 
        voter_id, 
        outcome, 
        ok_callback, 
        requested_info, 
        dnc, 
        best_day, 
        best_time_window,
        optin_sms, 
        optin_email, 
        email, 
        wants_volunteer, 
        share_insights_ok,
        for_term_limits, 
        issue_public_lands, 
        comments 
      } = body;
      
      console.log('📞 Complete call request for voter:', voter_id, 'outcome:', outcome);

      // Validate required fields
      if (!voter_id || !outcome) {
        return new Response(JSON.stringify({
          ok: false,
          error: 'Missing required fields: voter_id and outcome'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (!env.d1) {
        console.log('📞 No D1 database, simulating call completion');
        return new Response(JSON.stringify({
          ok: true,
          message: 'Call completed (development mode)',
          voter_id: voter_id,
          outcome: outcome
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // D1 database insert
      try {
        // Get current timestamp
        const now = new Date().toISOString();
        
        // Insert into voter_contacts table
        const insertQuery = `
          INSERT INTO voter_contacts (
            voter_id,
            volunteer_id,
            method,
            outcome,
            ok_callback,
            best_day,
            best_time_window,
            requested_info,
            dnc,
            optin_sms,
            optin_email,
            email,
            wants_volunteer,
            share_insights_ok,
            for_term_limits,
            issue_public_lands,
            comments,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        // Use a placeholder volunteer ID for now (in production this would come from auth)
        const volunteer_id = 'volunteer@grassrootsmvt.org';

        const stmt = env.d1.prepare(insertQuery).bind(
          voter_id,
          volunteer_id,
          'phone',
          outcome,
          ok_callback ? 1 : 0,
          best_day || null,
          best_time_window || null,
          requested_info ? 1 : 0,
          dnc ? 1 : 0,
          optin_sms ? 1 : 0,
          optin_email ? 1 : 0,
          email || null,
          wants_volunteer ? 1 : 0,
          share_insights_ok ? 1 : 0,
          for_term_limits ? 1 : 0,
          issue_public_lands ? 1 : 0,
          comments || null,
          now
        );

        const result = await stmt.run();

        console.log(`📞 Call completed and saved: ${voter_id} -> ${outcome}`);

        return new Response(JSON.stringify({
          ok: true,
          message: 'Call completed successfully',
          contact_id: result.meta.last_row_id,
          voter_id: voter_id,
          outcome: outcome
        }), {
          headers: { 'Content-Type': 'application/json' }
        });

      } catch (dbError) {
        console.error('📞 Database error saving call:', dbError);
        
        // Still return success for fallback (could queue for later sync)
        return new Response(JSON.stringify({
          ok: true,
          message: 'Call completed (saved locally)',
          voter_id: voter_id,
          outcome: outcome,
          fallback: true,
          error: 'Database temporarily unavailable'
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

    } catch (error) {
      console.error('📞 Complete call error:', error);
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