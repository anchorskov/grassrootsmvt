// worker/src/router.js

// Lightweight router with verb maps and a simple dynamic matcher.
// Exports a ready-to-use `router` instance with .get/.post/.put/.patch/.delete
// and a default request dispatcher compatible with your current usage.

class Router {
  constructor() {
    this.tables = {
      GET: new Map(),
      POST: new Map(),
      PUT: new Map(),
      PATCH: new Map(),
      DELETE: new Map(),
    };
  }

  get(path, handler)    { this.tables.GET.set(path, { handler }); }
  post(path, handler)   { this.tables.POST.set(path, { handler }); }
  put(path, handler)    { this.tables.PUT.set(path, { handler }); }
  patch(path, handler)  { this.tables.PATCH.set(path, { handler }); }
  delete(path, handler) { this.tables.DELETE.set(path, { handler }); }

  // Very small wildcard support: patterns ending with '*' match prefix
  // Also supports :param patterns like /admin/contacts/:id
  matchDynamic(method, path) {
    const table = this.tables[method] || new Map();
    for (const [pattern, entry] of table.entries()) {
      if (pattern.endsWith('*')) {
        const base = pattern.slice(0, -1);
        if (path.startsWith(base)) return entry;
      }
      
      // Support :param style routes
      if (pattern.includes(':')) {
        const patternParts = pattern.split('/');
        const pathParts = path.split('/');
        
        if (patternParts.length === pathParts.length) {
          const matches = patternParts.every((part, i) => {
            return part.startsWith(':') || part === pathParts[i];
          });
          if (matches) return entry;
        }
      }
    }
    return null;
  }

  // Main dispatcher (used by your fetch() export)
  handle(request, env, cfCtx, ctx = {}) {
    const urlPath = ctx.path || new URL(request.url).pathname;
    const method = request.method.toUpperCase();
    // Debug logging: print method, path, and all registered routes if env.DEBUG
    try {
      if (env?.DEBUG) {
        console.log(`[ROUTER] method=${method} path=${urlPath}`);
        for (const verb of Object.keys(this.tables)) {
          for (const [route, entry] of this.tables[verb].entries()) {
            console.log(`[ROUTER] Registered: ${verb} ${route}`);
          }
        }
      }
    } catch {}

    // Only use normalized path from ctx.path for matching
    const entry =
      (this.tables[method] && this.tables[method].get(urlPath)) ||
      this.matchDynamic(method, urlPath);
    if (entry) {
      return entry.handler(request, env, ctx);
    }
    // Check if path exists for any other method (for 405)
    const allMethods = Object.keys(this.tables);
    for (const m of allMethods) {
      if (m === method) continue;
      if (this.tables[m].has(urlPath) || this.matchDynamic(m, urlPath)) {
        return new Response('Method Not Allowed', { status: 405 });
      }
    }
    return new Response('Not Found', { status: 404 });
  }
}

// Create a singleton instance and export it.
// Your index.js should call `router(request, env, ctx, extra)` or
// use `router.handle(...)` depending on how you wire it. To preserve
// backward compatibility, we also export a callable wrapper.
const _router = new Router();

// Back-compat callable wrapper so existing code that does
// `return router(request, env, ctx, extra)` still works.
function callableRouter(request, env, cfCtx, ctx = {}) {
  return _router.handle(request, env, cfCtx, ctx);
}

// Re-export registration methods on the callable wrapper
callableRouter.get    = (...args) => _router.get(...args);
callableRouter.post   = (...args) => _router.post(...args);
callableRouter.put    = (...args) => _router.put(...args);
callableRouter.patch  = (...args) => _router.patch(...args);
callableRouter.delete = (...args) => _router.delete(...args);

// Named and default exports
export { callableRouter as router };
export default callableRouter;
