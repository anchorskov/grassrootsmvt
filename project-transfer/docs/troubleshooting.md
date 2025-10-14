# Troubleshooting Guide - GrassrootsMVT

## Overview
This guide covers common issues, debugging techniques, and solutions for the GrassrootsMVT platform across development and production environments.

## Common Issues & Solutions

### 1. Worker Request Hanging

#### Symptoms
- Worker responds with "Workers runtime canceled this request because it detected that your Worker's code had hung"
- API endpoints timeout or never respond
- Development server becomes unresponsive

#### Root Causes
- **Complex Dependencies**: Heavy imports (especially cryptography libraries like `jose`)
- **Infinite Loops**: Recursive function calls or while loops without exit conditions
- **Router Conflicts**: Multiple routing systems (Worker + Pages Functions) competing
- **Async/Await Issues**: Unresolved promises or missing await statements

#### Solutions
```javascript
// ✅ Minimal Worker Implementation
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Simple routing without external dependencies
    if (url.pathname === '/api/ping') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response('Not Found', { status: 404 });
  }
};

// ❌ Problematic Implementation
import { Router } from 'itty-router';
import { jwtVerify } from 'jose'; // Heavy crypto library

const router = Router();
// Complex routing that may cause conflicts...
```

#### Debugging Steps
1. **Simplify Worker**: Remove all dependencies and complex logic
2. **Test Minimal Response**: Implement only basic ping endpoint
3. **Add Features Gradually**: Introduce complexity one piece at a time
4. **Monitor Console**: Check for errors in wrangler dev output

### 2. Database Connection Issues

#### Symptoms
- "No D1 binding available" errors
- Database queries fail with undefined binding
- Migration commands fail

#### Root Causes
- **Incorrect Binding Names**: Mismatch between wrangler.toml and code
- **Wrong Database IDs**: Using incorrect database_id in configuration
- **Missing Migrations**: Database schema not applied
- **Environment Confusion**: Using wrong database for environment

#### Solutions
```toml
# ✅ Correct D1 Configuration
[[d1_databases]]
binding = "wy_preview"  # This name used in code: env.wy_preview
database_name = "wy_preview"
database_id = "de78cb41-176d-40e8-bd3b-e053e347ac3f"
migrations_dir = "db/migrations"
```

```javascript
// ✅ Correct Database Access
export default {
  async fetch(request, env, ctx) {
    try {
      // Use the exact binding name from wrangler.toml
      const db = env.wy_preview || env.wy;
      if (!db) {
        throw new Error('No D1 binding available');
      }
      
      const result = await db.prepare("SELECT COUNT(*) as count FROM voters").first();
      return new Response(JSON.stringify(result));
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
  }
};
```

#### Debugging Steps
1. **Verify Binding**: Check `npx wrangler d1 list` matches wrangler.toml
2. **Test Connection**: Use `npx wrangler d1 execute` to test direct access
3. **Check Migrations**: Ensure `npx wrangler d1 migrations apply` completed
4. **Environment Variables**: Verify correct database used per environment

### 3. Authentication Problems

#### Symptoms
- "Unauthorized" errors on protected endpoints
- Cloudflare Access not working
- JWT verification failures

#### Root Causes
- **Header Mismatch**: Incorrect authentication header names
- **Access Configuration**: Cloudflare Access not properly configured
- **JWT Issues**: Invalid JWT validation or expired tokens
- **Environment Variables**: Missing authentication configuration

#### Solutions
```javascript
// ✅ Simple Header-Based Auth (Development)
const email = request.headers.get('Cf-Access-Authenticated-User-Email');
const allowedEmails = env.ALLOWED_EMAILS?.split(',') || [];

if (!email || !allowedEmails.includes(email)) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
    status: 401,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

```javascript
// ✅ JWT Verification (Production) - Add gradually
import { jwtVerify, importJWK } from 'jose';

async function verifyJWT(token, env) {
  try {
    const certsResponse = await fetch(`https://${env.TEAM_DOMAIN}.cloudflareaccess.com/cdn-cgi/access/certs`);
    const certs = await certsResponse.json();
    
    for (const cert of certs.keys) {
      try {
        const publicKey = await importJWK(cert);
        const { payload } = await jwtVerify(token, publicKey);
        return { valid: true, payload };
      } catch (e) {
        continue;
      }
    }
    return { valid: false };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}
```

#### Debugging Steps
1. **Check Headers**: Log all request headers to see what's available
2. **Test Access**: Verify Cloudflare Access is working in browser
3. **Simplify Auth**: Start with header validation, add JWT later
4. **Environment Check**: Ensure auth variables are set correctly

### 4. CORS Issues

#### Symptoms
- Browser console shows CORS errors
- "Access-Control-Allow-Origin" missing
- Preflight requests failing

#### Root Causes
- **Missing CORS Headers**: No CORS headers in responses
- **Incorrect Origins**: Wrong origin in CORS configuration
- **OPTIONS Handling**: Preflight requests not handled
- **Development vs Production**: Different origin requirements

#### Solutions
```javascript
// ✅ Comprehensive CORS Handling
const corsHeaders = {
  'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,Cf-Access-Authenticated-User-Email',
  'Access-Control-Max-Age': '86400'
};

export default {
  async fetch(request, env, ctx) {
    // Handle preflight OPTIONS requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    
    // Your normal request handling...
    const response = await handleRequest(request, env, ctx);
    
    // Add CORS headers to all responses
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    
    return response;
  }
};
```

#### Debugging Steps
1. **Check Browser Console**: Look for specific CORS error messages
2. **Test with curl**: Verify headers without browser CORS enforcement
3. **Check Origins**: Ensure ALLOW_ORIGIN matches your UI domain
4. **Monitor Network Tab**: Check preflight OPTIONS requests

### 5. Wrangler Development Issues

#### Symptoms
- `wrangler dev` won't start
- "Port already in use" errors
- Hot reload not working

#### Root Causes
- **Port Conflicts**: Multiple wrangler instances running
- **Cache Issues**: Corrupted wrangler cache
- **Configuration Errors**: Invalid wrangler.toml syntax
- **Network Issues**: Firewall blocking local development

#### Solutions
```bash
# ✅ Clean Development Environment
# Kill existing wrangler processes
pkill -f wrangler

# Clear wrangler cache
rm -rf .wrangler/

# Check for port conflicts
lsof -i :8787

# Start with verbose logging
npx wrangler dev --log-level=debug
```

#### Debugging Steps
1. **Check Processes**: `ps aux | grep wrangler`
2. **Verify Config**: `npx wrangler config` to validate wrangler.toml
3. **Network Check**: `netstat -tlnp | grep 8787`
4. **Fresh Start**: Remove .wrangler/ directory and restart

### 6. Pages Functions Conflicts

#### Symptoms
- Routes not working as expected
- Functions not found errors
- Conflicting routing behavior

#### Root Causes
- **Dual Routing**: Both Worker and Pages Functions handling same routes
- **Function Priority**: Pages Functions overriding Worker routes
- **Build Issues**: Functions not building correctly

#### Solutions
```bash
# ✅ Clean Architecture - Choose One
# Option 1: Pure Worker (recommended)
rm -rf ui/functions/
# Remove _routes.json if it exists
rm -f ui/_routes.json

# Option 2: Pure Pages Functions
# Don't deploy Worker for API routes
```

```json
// If using Pages Functions, configure _routes.json
{
  "version": 1,
  "include": ["/api/*"],
  "exclude": []
}
```

#### Debugging Steps
1. **Architecture Decision**: Choose Worker OR Pages Functions, not both
2. **Clean Conflicts**: Remove conflicting routing systems
3. **Test Separately**: Deploy each system independently
4. **Monitor Routes**: Use `./scripts/check_cf_routes_conflicts.mjs`

## Debugging Tools & Techniques

### Logging & Monitoring

#### Worker Logging
```javascript
// ✅ Comprehensive Logging
export default {
  async fetch(request, env, ctx) {
    const start = Date.now();
    const url = new URL(request.url);
    
    console.log(`📨 ${request.method} ${url.pathname}`);
    
    try {
      const response = await handleRequest(request, env, ctx);
      
      const duration = Date.now() - start;
      console.log(`✅ ${request.method} ${url.pathname} - ${response.status} (${duration}ms)`);
      
      return response;
    } catch (error) {
      console.error(`❌ ${request.method} ${url.pathname} - ${error.message}`);
      console.error(error.stack);
      
      return new Response(
        JSON.stringify({ error: 'Internal Server Error', details: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }
};
```

#### Real-time Log Monitoring
```bash
# Monitor Worker logs in real-time
npx wrangler tail

# Filter for errors only
npx wrangler tail --status=error --format=pretty

# Monitor with JSON output for processing
npx wrangler tail --format=json | jq '.outcome.logs[]'
```

### Database Debugging

#### Query Testing
```bash
# Test database connectivity
npx wrangler d1 execute wy_preview --local --command="SELECT 1 as test;"

# Check table structure
npx wrangler d1 execute wy_preview --local --command="
  SELECT name, sql FROM sqlite_master WHERE type='table';
"

# Count records
npx wrangler d1 execute wy_preview --local --command="
  SELECT 
    'voters' as table_name, COUNT(*) as count FROM voters
  UNION ALL
  SELECT 
    'call_activity' as table_name, COUNT(*) as count FROM call_activity;
"
```

#### Performance Analysis
```sql
-- Check slow queries
EXPLAIN QUERY PLAN 
SELECT v.voter_id, v.political_party, p.phone_e164 
FROM voters v 
LEFT JOIN v_best_phone p ON v.voter_id = p.voter_id 
WHERE v.county = 'LARAMIE' 
LIMIT 10;

-- Check index usage
SELECT * FROM sqlite_master WHERE type='index';
```

### Network Debugging

#### API Testing
```bash
# Test basic connectivity
curl -v http://localhost:8787/api/ping

# Test with authentication headers
curl -H "Cf-Access-Authenticated-User-Email: test@example.com" \
     http://localhost:8787/api/whoami

# Test POST endpoints
curl -X POST \
     -H "Content-Type: application/json" \
     -d '{"voter_id":"TEST123","outcome":"vm"}' \
     http://localhost:8787/api/complete
```

#### Browser Testing
```javascript
// Browser console testing
fetch('/api/ping')
  .then(r => r.json())
  .then(console.log)
  .catch(console.error);

// Test with authentication
fetch('/api/whoami', {
  headers: {
    'Cf-Access-Authenticated-User-Email': 'volunteer@example.com'
  }
})
.then(r => r.json())
.then(console.log);
```

## Performance Troubleshooting

### Worker Performance

#### Memory Usage
```javascript
// Monitor memory usage
export default {
  async fetch(request, env, ctx) {
    const memBefore = performance.memory?.usedJSHeapSize || 0;
    
    const response = await handleRequest(request, env, ctx);
    
    const memAfter = performance.memory?.usedJSHeapSize || 0;
    console.log(`Memory used: ${((memAfter - memBefore) / 1024 / 1024).toFixed(2)}MB`);
    
    return response;
  }
};
```

#### Response Time Optimization
```javascript
// Measure and optimize response times
const start = performance.now();

// Your code here

const duration = performance.now() - start;
if (duration > 1000) { // Log slow responses
  console.warn(`Slow response: ${duration}ms for ${request.url}`);
}
```

### Database Performance

#### Query Optimization
```sql
-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_voters_county ON voters(county);
CREATE INDEX IF NOT EXISTS idx_voters_party ON voters(political_party);
CREATE INDEX IF NOT EXISTS idx_call_activity_voter ON call_activity(voter_id);
CREATE INDEX IF NOT EXISTS idx_call_activity_date ON call_activity(created_at);

-- Optimize voter search queries
SELECT v.voter_id, v.political_party, v.county 
FROM voters v 
WHERE v.voter_id LIKE ? 
  AND v.county = ?
ORDER BY v.voter_id 
LIMIT 10;
```

## Emergency Procedures

### Service Down Recovery
1. **Check Status**: Use health check script to identify failing components
2. **Quick Rollback**: Revert to last known working version
3. **Monitor Logs**: Check for errors during rollback
4. **Verify Recovery**: Run full verification suite

### Data Corruption Recovery
1. **Stop Writes**: Temporarily disable write operations
2. **Assess Damage**: Determine scope of corruption
3. **Restore Backup**: Use most recent clean backup
4. **Verify Integrity**: Check data consistency after restore

### Security Incident Response
1. **Isolate**: Temporarily disable affected endpoints
2. **Investigate**: Review logs for suspicious activity
3. **Patch**: Apply security fixes
4. **Monitor**: Increase monitoring during recovery

## Prevention Strategies

### Code Quality
- Implement comprehensive testing before deployment
- Use TypeScript for better error catching
- Regular code reviews focusing on performance
- Monitoring and alerting for runtime errors

### Infrastructure
- Regular backup testing and verification
- Staged deployment with rollback capabilities
- Monitoring and alerting for all critical components
- Documentation of all procedures and configurations

### Security
- Regular security audits and penetration testing
- Keep all dependencies updated
- Implement proper authentication and authorization
- Monitor for unusual access patterns