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
export default async function onRequest(context) {
  const { request, env } = context;
  // Simple ping that supports preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': env?.ALLOW_ORIGIN || '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Allow-Credentials': 'true'
      }
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      'Access-Control-Allow-Origin': env?.ALLOW_ORIGIN || '*',
      'Access-Control-Allow-Credentials': 'true'
    }
  });
}
export const onRequestGet = () =>
  new Response(JSON.stringify({ ok: true, where: "ui/functions/api/ping.js" }), {
    headers: { "content-type": "application/json" }
  });
