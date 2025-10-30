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
