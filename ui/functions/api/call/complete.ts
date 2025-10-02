export const onRequestPost: PagesFunction = async ({ request, env }) => {
  const email = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (!email) return new Response("Unauthorized", { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { voter_id, method = "phone", outcome = "", notes = "" } = body;

  if (!voter_id) return new Response("voter_id required", { status: 400 });

  await env.DB.prepare(
    `INSERT INTO voter_contacts(voter_id, method, outcome, notes)
     VALUES (?1, ?2, ?3, ?4)`
  ).bind(voter_id, method, outcome, notes).run();

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" }
  });
};
