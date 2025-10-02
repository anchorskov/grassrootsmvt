export const onRequestPost: PagesFunction = async ({ request, env }) => {
  const email = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (!email) return new Response("Unauthorized", { status: 401 });

  const rs = await env.DB.prepare(
    "SELECT voter_id, first_name, last_name FROM v_eligible_call LIMIT 1"
  ).all();

  return new Response(JSON.stringify({ next: rs.results?.[0] || null }), {
    headers: { "content-type": "application/json" }
  });
};
