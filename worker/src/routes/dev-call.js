// worker/src/routes/dev-call.js
// Handles POST /api/call for local dev (mock) and production (real).

export default {
  path: '/api/call',
  method: 'POST',
  async handler(req, env) {
    const { ENVIRONMENT } = env;

    // --- Always clone the request before consuming ---
    // Prevents "ReadableStream disturbed" errors when CORS or logging reads body later
    let payload = {};
    try {
      const clone = req.clone();
      payload = await clone.json();
    } catch (err) {
      console.warn('⚠️ Failed to parse JSON body:', err.message);
    }

    // --- Production mode: placeholder real logic or confirm-only response ---
    if (ENVIRONMENT === 'production') {
      return new Response(JSON.stringify({ ok: true, status: 'live' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // --- Development mode: mock call simulation ---
    const mock = {
      id: `dev-${crypto.randomUUID().slice(0, 8)}`,
      name: payload.name || 'Test Voter',
      city: payload.city || 'CASPER',
      county: payload.county || 'NATRONA',
      phone: '(307) 555-0123',
      party: payload.party || 'Republican',
      timestamp: new Date().toISOString(),
      received: payload, // echo back original payload for debugging
    };

    return new Response(JSON.stringify({ ok: true, voter: mock }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
