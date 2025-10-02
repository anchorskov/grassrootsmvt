export const onRequestGet = ({ request }) => {
  const accessEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
  const email = accessEmail || "dev@local";
  return new Response(JSON.stringify({ email }), {
    headers: { "content-type": "application/json" }
  });
};
