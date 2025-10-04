export const onRequestGet = ({ request }) => {
  const accessEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (accessEmail) return new Response(JSON.stringify({ email: accessEmail }), { headers: { "content-type": "application/json" } });

  // Accept JWT header or CF_Authorization cookie
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion') || (() => {
    const cookie = request.headers.get('Cookie') || '';
    const m = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/i);
    return m ? decodeURIComponent(m[1]) : null;
  })();

  if (jwt) return new Response(JSON.stringify({ jwt }), { headers: { "content-type": "application/json" } });

  const email = "dev@local";
  return new Response(JSON.stringify({ email }), {
    headers: { "content-type": "application/json" }
  });
};
