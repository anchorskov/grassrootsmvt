export async function onRequestGet({ env }) {
  // Only allow this endpoint in local/dev environments to avoid leaking secrets.
  if (env.ENVIRONMENT !== "local") {
    return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Return a safe list of environment keys (not values) so devs can see what's bound.
  const keys = Object.keys(env).sort();
  return new Response(JSON.stringify({ ok: true, env: keys }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
