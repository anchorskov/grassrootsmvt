// ui/functions/api/ping.js
import { handleCorsPreflight, getCorsHeaders } from '../_utils/cors.js';

export async function onRequestOptions({ request, env }) {
  return handleCorsPreflight(request, env);
}

export async function onRequestGet({ env, request }) {
  const origin = request.headers.get('Origin');
  return new Response(JSON.stringify({ ok: true, env: env.ENVIRONMENT || 'unknown' }), {
    headers: { ...getCorsHeaders(env, origin), 'Content-Type': 'application/json' },
  });
}
