// ui/functions/api/call/next.js
import { handleCorsPreflight, getCorsHeaders } from '../../_utils/cors.js';
import { verifyAccessJWT } from '../../_utils/verifyAccessJWT.js';

export async function onRequestOptions({ request, env }) {
  return handleCorsPreflight(request, env);
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  const cors = getCorsHeaders(env, origin);

  // 🔐 Require valid Authorization: Bearer <token>
  const verification = await verifyAccessJWT(request, env);
  if (!verification || !verification.valid || !verification.email) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // ✅ Example stubbed voter data
  const body = await request.json().catch(() => ({}));
  const voter = {
    ok: true,
    voter_id: 'TEST123',
    first_name: 'Jane',
    last_name: 'Doe',
    city: 'Casper',
    zip: '82601',
    phone_e164: '+13075551234',
    received: body,
    user: verification.email,
  };

  return new Response(JSON.stringify(voter), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
