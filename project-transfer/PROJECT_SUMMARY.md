# GrassrootsMVT Project Summary

## 🚨 **Current Status: NON-FUNCTIONAL DUE TO CONFIGURATION CONFLICTS**

**Last Updated:** October 13, 2025
**Priority:** Critical - Project requires immediate configuration reconciliation

---

## 📋 **Project Overview**

**GrassrootsMVT** is a grassroots voter outreach platform designed for political campaigns and advocacy organizations. The system enables volunteers to conduct phone canvassing operations with real-time voter data, call tracking, and volunteer coordination.

### **Core Architecture**
- **Frontend:** Cloudflare Pages (Vanilla HTML/JS)
- **Backend:** Cloudflare Workers (JavaScript ES2022) 
- **Database:** Cloudflare D1 (SQLite-compatible)
- **Authentication:** Cloudflare Access + JWT
- **Development:** Wrangler CLI

---

## 🚨 **Critical Configuration Conflicts Identified**

### **1. Domain/Origin Conflicts**
| Component | Documentation Says | Actual Configuration | Status |
|-----------|-------------------|---------------------|--------|
| **Worker ALLOW_ORIGIN** | `https://grassrootsmvt.org` | `https://volunteers.grassrootsmvt.org` | ❌ **CONFLICT** |
| **UI Domain** | `grassrootsmvt.org` | `volunteers.grassrootsmvt.org` | ❌ **CONFLICT** |
| **API Domain** | `api.grassrootsmvt.org` | `api.grassrootsmvt.org` | ✅ **CONSISTENT** |

### **2. Worker Name Inconsistencies**
| Configuration | Value | Status |
|--------------|-------|--------|
| **Current wrangler.toml** | `name = "grassrootsmvt"` | ✅ **CORRECT** |
| **Documentation** | `name = "grassrootsmvt"` | ✅ **CONSISTENT** |
| **Deployed Worker** | `grassrootsmvt-production` | ✅ **EXPECTED** |

### **3. Route Configuration**
| Route Pattern | Status | Issue |
|---------------|--------|-------|
| `api.grassrootsmvt.org/*` | ✅ **WORKING** | None |
| `grassrootsmvt.org/api/*` | ✅ **WORKING** | None |
| UI serving | ❌ **BROKEN** | CORS/Origin mismatch |

---

## 🏗️ **Technical Architecture Status**

### **✅ Working Components**
- **Cloudflare Worker API:** Fully functional, JWT-protected
- **D1 Database:** Connected and optimized (95% query speed improvement)
- **Authentication Framework:** Cloudflare Access integration complete
- **API Endpoints:** Complete suite (/api/call, /api/canvass, /api/pulse, /api/templates)
- **Deployment Scripts:** Multiple deployment automation scripts available

### **❌ Broken Components**
- **UI Integration:** Frontend cannot connect to API due to CORS conflicts
- **Cross-Domain Communication:** Origin header mismatches blocking requests
- **Development Environment:** Local dev server fails to start properly

### **⚠️ Partially Working**
- **Authentication:** JWT extraction works, but UI integration incomplete
- **Routing:** API routes work, UI routes have conflicts

---

## 🔧 **Current Configuration State**

### **Worker Configuration (`worker/wrangler.toml`)**
```toml
name = "grassrootsmvt"
account_id = "8bfd3f60fbdcc89183e9e312fb03e86e"

[env.production.vars]
ENVIRONMENT = "production"
ALLOW_ORIGIN = "https://volunteers.grassrootsmvt.org"  # ❌ CONFLICTS WITH DOCS
DATA_BACKEND = "d1"
DEBUG_CORS = "false"

[env.production]
routes = [
  { pattern = "api.grassrootsmvt.org/*", zone_name = "grassrootsmvt.org" },
  { pattern = "grassrootsmvt.org/api/*", zone_name = "grassrootsmvt.org" }
]
```

### **UI Configuration**
- **Deployment Target:** Cloudflare Pages
- **Expected Domain:** `volunteers.grassrootsmvt.org`
- **API Client:** `ui/src/apiClient.js` (346 lines, JWT-enabled)
- **Routes Config:** `ui/_routes.json` (excludes /api/*)

### **Authentication Setup**
- **Provider:** Cloudflare Access
- **JWT Cookie:** `CF_Authorization`
- **Application AUD:** `76fea0745afec089a3eddeba8d982b10aab6d6f871e43661cb4977765b78f3f0`
- **Team Domain:** `skovgard.cloudflareaccess.com`

---

## 📚 **Documentation Status & Conflicts**

### **Conflicting Documentation Files**
1. **`docs/cloudflare_setup.md`** - Claims production ALLOW_ORIGIN should be `https://grassrootsmvt.org`
2. **`docs/wrangler_config.md`** - Shows multiple environment examples with different origins
3. **`docs/production_deployment_guide.md`** - References `api.grassrootsmvt.org` correctly
4. **`worker/wrangler.toml`** - Actually configured for `https://volunteers.grassrootsmvt.org`

### **Documentation Accuracy Assessment**
| File | Accuracy | Issues |
|------|----------|--------|
| `cloudflare_setup.md` | ❌ **OUTDATED** | Wrong ALLOW_ORIGIN domain |
| `overview.md` | ✅ **ACCURATE** | General architecture correct |
| `deployment.md` | ⚠️ **MIXED** | Some configs outdated |
| `wrangler_config.md` | ❌ **CONFLICTING** | Multiple conflicting examples |

---

## 🚀 **Available Deployment Scripts**

| Script | Purpose | Status |
|--------|---------|--------|
| `deploy_worker_safe.sh` | Safe Worker deployment with validation | ✅ **WORKING** |
| `deploy_and_verify.sh` | Comprehensive deploy + verification (268 lines) | ✅ **WORKING** |
| `deploy_all.sh` | Deploy both Worker + UI Pages | ⚠️ **NEEDS TESTING** |
| `verify_routes.mjs` | Production route verification | ✅ **WORKING** |
| `verify_production.sh` | Full production health check | ✅ **WORKING** |

---

## 🎯 **Immediate Action Required**

### **Critical Path to Resolution:**

1. **Domain Reconciliation**
   - Decide on final domain strategy: `grassrootsmvt.org` vs `volunteers.grassrootsmvt.org`
   - Update ALLOW_ORIGIN in wrangler.toml to match UI domain
   - Update all documentation to reflect chosen domains

2. **UI Integration**
   - Deploy UI to Cloudflare Pages with correct domain binding
   - Test API connectivity with proper CORS headers
   - Verify JWT token flow end-to-end

3. **Documentation Cleanup**
   - Update `docs/cloudflare_setup.md` with correct ALLOW_ORIGIN
   - Reconcile all configuration examples in documentation
   - Create single source of truth for environment variables

4. **Testing & Validation**
   - Run full end-to-end authentication flow
   - Verify all API endpoints with JWT protection
   - Test volunteer workflow from UI through API to database

---

## 📁 **Key Project Files**

### **Configuration Files**
- `worker/wrangler.toml` - Worker deployment configuration
- `ui/_routes.json` - UI routing configuration  
- `ui/package.json` - UI dependencies and scripts

### **Core Implementation**
- `worker/src/index.js` - Main Worker API implementation (22KB)
- `ui/src/apiClient.js` - JWT-enabled API client (346 lines)
- `scripts/deploy_worker_safe.sh` - Tested deployment automation

### **Documentation** 
- `docs/overview.md` - Project architecture (accurate)
- `docs/cloudflare_setup.md` - Setup guide (needs updating)
- `docs/troubleshooting.md` - Debug procedures

### **Deployment Scripts**
- `scripts/deploy_and_verify.sh` - Full deployment + verification
- `scripts/verify_routes.mjs` - Production validation
- `logs/deploy_summary_*.txt` - Deployment history

---

## 💡 **Recommended Next Steps for New Project**

1. **Start Fresh with Clear Domain Strategy**
2. **Use Current Worker Code (Functional)**
3. **Fix UI Integration with Correct CORS Configuration**
4. **Establish Single Source of Truth for All Configuration**
5. **Test Authentication Flow End-to-End**
6. **Update All Documentation to Match Working Configuration**

---

**Bottom Line:** The backend infrastructure is solid, but UI integration is blocked by CORS/domain configuration conflicts that need immediate resolution.