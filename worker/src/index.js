// worker/src/index.js
// Unified API routing for GrassrootsMVT — Cloudflare Zero Trust parity
// Works identically in dev (CORS-enabled) and prod (Access-managed)

import whoami from './routes/whoami.js';
import streets from './routes/streets.js';
import devCall from './routes/dev-call.js';
import devAuthRoutes from './routes/dev-auth.js';
import testD1 from './routes/test-d1.js';
import canvassNearby from './routes/canvass-nearby.js';
import contactStatus from './routes/contact-status.js';
import next from './routes/next.js';
import complete from './routes/complete.js';
import { handleWithCors } from './utils/cors.js';

// Collect all route definitions
const routes = [whoami, streets, devCall, testD1, canvassNearby, contactStatus, next, complete, ...devAuthRoutes];

/**
 * Central router for all API requests.
 * Wraps every handler via `handleWithCors()` to ensure:
 * - Safe CORS in local dev
 * - Seamless Cloudflare Access in production
 * - No "ReadableStream disturbed" errors
 * - Consistent JSON error responses
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Use handleWithCors for all paths (including OPTIONS)
    return handleWithCors(async (req, environment) => {
      // --- Route matching ---
      for (const route of routes) {
        if (url.pathname === route.path || url.pathname.startsWith(route.path + '/')) {
          // Check if method is allowed
          const allowedMethods = Array.isArray(route.method) ? route.method : [route.method];
          if (allowedMethods.includes(req.method)) {
            const res = await route.handler(req, environment);
            // Each route handler returns a valid Response
            return res;
          } else {
            // Method not allowed for this route
            return new Response(JSON.stringify({ 
              error: 'Method Not Allowed',
              allowed: allowedMethods 
            }), {
              status: 405,
              headers: { 
                'Content-Type': 'application/json',
                'Allow': allowedMethods.join(', ')
              },
            });
          }
        }
      }

      // --- Default 404 ---
      return new Response(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }, request, env);
  },
};
