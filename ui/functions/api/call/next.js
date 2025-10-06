// ui/functions/api/call/next.js
import { handleOptions, getCorsHeaders, isAllowedOrigin } from '../../_utils/cors.js';
import { verifyAccessJWT } from '../../_utils/verifyAccessJWT.js';

export async function onRequestOptions(context) {
  return handleOptions(context.request);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const origin = request.headers.get('Origin') || '*';

  if (!isAllowedOrigin(origin)) {
    return new Response('CORS not allowed', { status: 403 });
  }

  const verification = await verifyAccessJWT(request, env);
  if (!verification.valid) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }

  // Stub data for testing
  const sampleNext = {
    ok: true,
    voter_id: 'TEST123',
    first_name: 'Jane',
    last_name: 'Doe',
    city: 'Casper',
    zip: '82601',
    phone_e164: '+13075551234',
  };

  return new Response(JSON.stringify(sampleNext), {
    headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' },
  });
}
