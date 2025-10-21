# CORS Utility Architecture

## Overview

The worker now uses a cleaner, environment-based CORS architecture that separates development and production concerns using utility functions.

## New Architecture

### Core Utilities (`worker/src/utils/cors.js`)

- **`shouldBypassAuth(env)`**: Determines if authentication should be bypassed based on `ENVIRONMENT` variable
- **`getAllowedOrigins(env)`**: Parses `ALLOW_ORIGIN` environment variable with fallback defaults
- **`getRequestOrigin(request, env)`**: Validates and returns allowed origin for the request
- **`addCorsHeaders(headers, allowedOrigin)`**: Adds CORS headers to any Headers object
- **`createPreflightResponse(allowedOrigin)`**: Creates proper OPTIONS preflight responses
- **`createCorsJsonResponse(data, options)`**: Creates JSON responses with CORS headers
- **`wrapWithCors(response, allowedOrigin)`**: Wraps any response with CORS headers

### Environment Configuration

The system uses the `ALLOW_ORIGIN` environment variable from `wrangler.toml`:

```toml
# Local development
[vars]
ALLOW_ORIGIN = "http://127.0.0.1:8788,http://localhost:8788,http://localhost:5173"

# Production
[env.production.vars]  
ALLOW_ORIGIN = "https://volunteers.grassrootsmvt.org"
```

### Key Benefits

1. **Cleaner Code**: Replaced inline CORS handling with reusable utilities
2. **Environment Separation**: Clear distinction between local development and production behavior
3. **Consistent Headers**: All responses use the same CORS utility functions
4. **Proper Caching**: Automatic `Vary: Origin` header for correct cache behavior
5. **Centralized Logic**: All CORS logic in one place for easy maintenance

### Authentication Flow

- **Local Development**: `shouldBypassAuth(env)` returns `true` when `ENVIRONMENT !== 'production'`
- **Production**: Uses Cloudflare Access headers for authentication
- **Mock User**: Local development returns `{ email: 'dev@localhost', name: 'Local Developer', isLocal: true }`

### Testing Results

All CORS functionality verified working:
- ✅ Origin-based CORS headers: `Access-Control-Allow-Origin: http://localhost:8788`
- ✅ Credentials support: `Access-Control-Allow-Credentials: true`
- ✅ Proper caching: `Vary: Origin` header
- ✅ Preflight responses: OPTIONS requests with proper headers
- ✅ Environment detection: Local development bypasses auth correctly

## Migration Notes

The previous inline CORS handling has been replaced with utility functions. Key changes:

- `parseAllowedOrigins()` → `getAllowedOrigins()`
- `pickAllowedOrigin()` → `getRequestOrigin()`
- `withCorsHeaders()` → `addCorsHeaders()`
- `preflightResponse()` → `createPreflightResponse()`
- Manual response creation → `createCorsJsonResponse()`

This maintains full backward compatibility while providing cleaner, more maintainable code.