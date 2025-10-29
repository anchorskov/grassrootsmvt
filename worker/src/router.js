import * as routes from './routes/index.js';
import { withCorsHeaders } from './utils/cors.js';

export async function router(request, env, ctx, { config, path, allowedOrigin }) {
  const route = routes[path];
  if (route) {
    return route(request, env, ctx, { config, allowedOrigin });
  }

  return new Response(JSON.stringify({ ok: false, error: "Not Found" }), {
    status: 404,
    headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin)
  });
}
