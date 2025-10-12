# 🚀 Cloudflare Worker Migration Plan

## Current State Analysis
- **Issue**: Dual architecture causing request hanging
- **Root Cause**: Both Worker (src/index.js) and Pages Functions (functions/) handling same routes
- **Status**: ❌ Non-functional - infinite loops

## Recommended Solution: Pure Worker Architecture

### Phase 1: Cleanup Conflicting Files
```bash
cd /home/anchor/projects/grassrootsmvt

# Remove conflicting Pages Functions
rm -rf functions/
rm -rf worker/functions/_middleware.js
rm -rf worker/functions/middleware/
rm -rf worker/functions/utils/
rm -rf worker/functions/.eslintrc.json
rm -rf worker/functions/.esbuildignore

# Keep only essential API handlers for reference
mkdir -p temp_api_backup
cp -r worker/functions/api/ temp_api_backup/
rm -rf worker/functions/

# Clean up root-level duplicates
rm -rf api.disabled/
rm wrangler.bakup
```

### Phase 2: Simplify Worker Router
- Convert Pages Functions to pure Worker handlers
- Remove dependencies on Pages Functions context
- Use direct D1 bindings instead of context wrapper

### Phase 3: Update Configuration
```toml
# worker/wrangler.toml - simplified
name = "grassrootsmvt"
main = "src/index.js"
compatibility_date = "2025-10-08"

[[d1_databases]]
binding = "wy"
database_name = "wy"
database_id = "4b4227f1-bf30-4fcf-8a08-6967b536a5ab"

[[d1_databases]]  
binding = "wy_preview"
database_name = "wy_preview"
database_id = "de78cb41-176d-40e8-bd3b-e053e347ac3f"
```

### Phase 4: Update Directory Structure
```
grassrootsmvt/
├── worker/
│   ├── src/
│   │   └── index.js           # ✅ Single entrypoint
│   ├── wrangler.toml          # ✅ Worker config
│   └── package.json           # ✅ Worker dependencies
├── ui/                        # ✅ Static files only
├── scripts/                   # ✅ Development tools
└── db/                        # ✅ D1 migrations
```

### Phase 5: Environment Variables
```bash
# .dev.vars (worker-specific)
ENVIRONMENT=local
ALLOW_ORIGIN=http://localhost:8788
DEBUG_CORS=true
```

## Files to Delete
```bash
rm -rf functions/
rm -rf api.disabled/
rm -rf worker/functions/_middleware.js
rm -rf worker/functions/middleware/
rm -rf worker/functions/utils/
rm wrangler.bakup
rm verify__*.txt
```

## Files to Keep
- `worker/src/index.js` (main entrypoint)
- `worker/wrangler.toml` (Worker config)
- `ui/` (static frontend)
- `scripts/` (development tools)
- `db/` (D1 migrations)

## Next Steps
1. Execute cleanup commands
2. Restart wrangler dev
3. Test API endpoints
4. Deploy to production