export const onRequestGet: PagesFunction = async ({ request }) => {
  const email = request.headers.get("Cf-Access-Authenticated-User-Email") || "unknown";
  return new Response(JSON.stringify({ email }), {
    headers: { "content-type": "application/json" }
  });
};
