import { handleOptions, getCorsHeaders, isAllowedOrigin } from '../_utils/cors.js';

export async function onRequestOptions(context) {
  return handleOptions(context.request);
}

export async function onRequestGet(context) {
  const origin = context.request.headers.get('Origin') || '*';
  if (!isAllowedOrigin(origin)) {
    return new Response('CORS not allowed', { status: 403 });
  }

  return new Response(JSON.stringify({ ok: true, env: context.env.ENVIRONMENT }), {
    headers: {
      ...getCorsHeaders(origin),
      'Content-Type': 'application/json',
    },
  });
}
