// Minimal ui/_worker.js
// The previous custom worker was moved to ui/_worker.disabled.js to allow
// Pages to route `/api/*` to Pages Functions located under ui/functions.
// This minimal worker simply serves static assets and does not intercept
// API routes so the Functions runtime can handle them.

export default {
  async fetch(request, env) {
    // Let Pages Functions handle /api/* routes. For everything else,
    // serve static assets from the Pages Assets binding.
    return env.ASSETS.fetch(request);
  }
};
