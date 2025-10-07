// ui/functions/api/whoami.js
import { handleCorsPreflight, getCorsHeaders } from '../_utils/cors.js';
import { verifyAccessJWT } from '../_utils/verifyAccessJWT.js';

export async function onRequestOptions({ request, env }) {
  return handleCorsPreflight(request, env);
}

export async function onRequestGet({ request, env }) {
  const origin = request.headers.get('Origin');
  const cors = getCorsHeaders(env, origin);

  const verification = await verifyAccessJWT(request, env);
  if (!verification.valid) {
    return new Response(JSON.stringify({ ok: false, error: verification.error }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, email: verification.email }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
