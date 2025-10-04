// ui/functions/api/service-token-exchange.js
// Admin-only helper to perform a service-token exchange and return the
// CF_Authorization cookie. This is security-sensitive: protect with
// ADMIN_SECRET env variable and restrict access to operators.

export const onRequestPost = async ({ request, env }) => {
  // Simple admin guard: require a matching secret header
  const adminHeader = request.headers.get('X-Admin-Secret') || '';
  if (!env.ADMIN_SECRET || adminHeader !== env.ADMIN_SECRET) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } });
  }

  let body = {};
  try {
    body = await request.json();
  } catch (e) {
    // allow empty body to use env-provided creds
    body = {};
  }

  // Accept client credentials in body or fall back to env values
  const clientId = body.client_id || env.CF_ACCESS_CLIENT_ID;
  const clientSecret = body.client_secret || env.CF_ACCESS_CLIENT_SECRET;
  const targetHost = body.target_host || env.SERVICE_TOKEN_TARGET_HOST; // e.g. volunteers.grassrootsmvt.org

  if (!clientId || !clientSecret || !targetHost) {
    return new Response(JSON.stringify({ error: 'missing_params', need: ['client_id|CF_ACCESS_CLIENT_ID','client_secret|CF_ACCESS_CLIENT_SECRET','target_host|SERVICE_TOKEN_TARGET_HOST'] }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  // Perform initial request with service token headers to obtain cookie
  try {
    const res = await fetch(`https://${targetHost}/`, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'CF-Access-Client-Id': clientId,
        'CF-Access-Client-Secret': clientSecret,
      },
    });

    // Cloudflare should set CF_Authorization cookie in Set-Cookie header
    const setCookie = res.headers.get('set-cookie') || res.headers.get('Set-Cookie') || null;

    if (!setCookie) {
      // Try to read location/status to give better diagnostics
      const status = res.status;
      const loc = res.headers.get('location');
      return new Response(JSON.stringify({ error: 'no-cookie', status, location: loc }), { status: 502, headers: { 'content-type': 'application/json' } });
    }

    // Return the raw Set-Cookie header (admin-only endpoint)
    return new Response(JSON.stringify({ set_cookie: setCookie }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'exchange-failed', message: String(err) }), { status: 502, headers: { 'content-type': 'application/json' } });
  }
};

export const onRequestOptions = () => new Response(null, { status: 204 });
