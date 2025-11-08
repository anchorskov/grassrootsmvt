// Path: worker/src/auth.js
// Minimal guard. Local is open. Production is protected by Cloudflare Access before the Worker.
export function requireAuth(env) {
  return async (c, next) => {
    const mode = String(env?.AUTH_MODE || env?.ENVIRONMENT || 'none').toLowerCase();
    const isLocal = mode === 'none' || mode === 'local' || mode === 'dev';
    if (isLocal) return next();
    return next();
  };
}

/**
 * Check if a user is an admin
 * In production, this always returns true because Cloudflare Zero Trust Access
 * handles authorization via the /admin/* path policy
 */
export function isAdmin(email, env) {
  // Cloudflare Zero Trust Access handles authorization
  // If user reached this code on /admin/* path, they passed the policy
  return true;
}

/**
 * Require admin access
 * In production, this is a no-op because Cloudflare Zero Trust Access
 * already blocked unauthorized users before they reach the worker
 */
export function requireAdmin(email, env) {
  // Cloudflare Zero Trust Access handles this at the edge
  // No need for additional checks
  return true;
}
