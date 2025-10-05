export async function onRequest({ request }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '600'
    }});
  }

  const headers = {};
  for (const [k, v] of request.headers) headers[k] = v;

  const body = {
    ok: true,
    from: 'pages-functions-echo',
    method: request.method,
    url: String(request.url),
    headers,
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }
  });
}
