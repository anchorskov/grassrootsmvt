import { requireAdminEmail } from "./_auth";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const gate = requireAdminEmail(request);
  if (!gate.ok) return gate.res;

  const q = `
    SELECT voter_id, due_date, reason, created_by, created_at
    FROM call_followups
    WHERE COALESCE(done,0)=0
    ORDER BY due_date ASC, created_at ASC
    LIMIT 200
  `;
  const rs = await env.DB.prepare(q).all();
  return new Response(JSON.stringify({ rows: rs.results || [] }), {
    headers: { "content-type": "application/json" }
  });
};
