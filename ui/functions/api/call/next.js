import { handleOptions, getCorsHeaders, isAllowedOrigin } from '../../_utils/cors.js';
import { verifyAccessJWT } from '../../_utils/verifyAccessJWT.js';

export async function onRequestOptions(context) {
  return handleOptions(context.request);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const origin = request.headers.get('Origin') || '';

  if (!isAllowedOrigin(origin)) {
    return new Response('Forbidden: Origin not allowed', { status: 403 });
  }

  try {
    const payload = await verifyAccessJWT(request, env);
    const data = await request.json().catch(() => ({}));

    return new Response(
      JSON.stringify({ ok: true, user: payload.email, next: 'voter', received: data }),
      {
        headers: {
          ...getCorsHeaders(origin),
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Unauthorized', message: error.message }), {
      status: 401,
      headers: {
        ...getCorsHeaders(origin),
        'Content-Type': 'application/json',
      },
    });
  }
}
export default async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': env?.ALLOW_ORIGIN || '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Credentials': 'true' } });
  }

  // Minimal stub implementation: return a placeholder next call object
  const payload = { next: null, message: 'no calls available (stub)' };
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': env?.ALLOW_ORIGIN || '*', 'Access-Control-Allow-Credentials': 'true' }
  });
}
export const onRequestOptions = () =>
  new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "https://volunteers.grassrootsmvt.org",
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": "content-type, cf-access-jwt-assertion",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    },
  });

export const onRequestPost = async ({ request, env }) => {
  // read JSON body
  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }
  const { filters, after_id, exclude_ids } = body;

  // Pick the next voter (stubbed behavior)
  const voter = {
    ok: true,
    voter_id: "TEST123",
    first_name: "Jane",
    last_name: "Doe",
    party: "R",
    ra_city: "Casper",
    ra_zip: "82601",
    phone_e164: "+13075551234",
  };

  return new Response(JSON.stringify(voter), {
    headers: { "content-type": "application/json" },
  });
};
