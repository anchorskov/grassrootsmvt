import { router } from './router.js';
import { getEnvironmentConfig } from './utils/env.js';
import { preflightResponse, pickAllowedOrigin } from './utils/cors.js';

export default {
  async fetch(request, env, ctx) {
    const config = getEnvironmentConfig(env);
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api(?=\/|$)/, "");
    const allowedOrigin = pickAllowedOrigin(request, env);

    if (request.method === "OPTIONS") {
      return preflightResponse(allowedOrigin);
    }

    return router(request, env, ctx, { config, path, allowedOrigin });
  }
};
