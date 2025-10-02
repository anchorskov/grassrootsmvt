import { requireAdminEmail } from "./_auth";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const gate = requireAdminEmail(request);
  if (!gate.ok) return gate.res;

  try {
    const rs = await env.DB.prepare("SELECT datetime('now') AS now").all();
    return new Response(JSON.stringify({ ok: true, db_now: rs.results?.[0]?.now || null }), {
      headers: { "content-type": "application/json" }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
};
