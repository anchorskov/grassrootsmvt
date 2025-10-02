import { requireAdminEmail } from "../_auth";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const gate = requireAdminEmail(request);
  if (!gate.ok) return gate.res;

  const q = `
    SELECT voter_id, method, outcome, notes, created_at
    FROM voter_contacts
    ORDER BY datetime(created_at) DESC
    LIMIT 200
  `;
  const rs = await env.DB.prepare(q).all();
  return new Response(JSON.stringify({ rows: rs.results || [] }), {
    headers: { "content-type": "application/json" }
  });
};
