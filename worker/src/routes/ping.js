import { withCorsHeaders } from '../utils/cors.js';

export default async function handle(request, env, ctx, { config, allowedOrigin }) {
  return new Response(
    JSON.stringify({
      ok: true,
      worker: "grassrootsmvt",
      environment: config.environment,
      timestamp: Date.now()
    }),
    {
      status: 200,
      headers: withCorsHeaders({ "Content-Type": "application/json" }, allowedOrigin)
    }
  );
}
