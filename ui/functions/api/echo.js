import { handleCorsPreflight, getCorsHeaders } from '../_utils/cors.js';

export async function onRequest({ request }) {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  const headers = {};
  for (const [k, v] of request.headers) headers[k] = v;

  const body = {
    ok: true,
    from: 'pages-functions-echo',
    method: request.method,
    url: String(request.url),
    headers,
  };

  const cors = getCorsHeaders(request) || {};
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...cors }
  });
}
