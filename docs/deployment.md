# Deployment Guide - GrassrootsMVT

## Overview
This guide covers production deployment, staging environments, rollback procedures, and monitoring for the GrassrootsMVT platform.

## Pre-Deployment Checklist

### Code Readiness
- [ ] All tests passing locally
- [ ] Database migrations tested on preview database
- [ ] API endpoints verified with automated testing
- [ ] CORS configuration updated for production domains
- [ ] Environment variables configured for production

### Security Verification
- [ ] Cloudflare Access configured and tested
- [ ] JWT authentication working correctly
- [ ] Secrets properly stored (not in code)
- [ ] API rate limiting configured
- [ ] HTTPS enforced for all endpoints

### Infrastructure Preparation
- [ ] D1 production database ready with current schema
- [ ] Custom domain DNS configured (if applicable)
- [ ] Monitoring and alerting configured
- [ ] Backup procedures tested

## Deployment Environments

### Development Environment
- **Worker**: `localhost:8787` (local wrangler dev)
- **UI**: `localhost:8788` (local pages dev)
- **Database**: `wy_preview` (local D1 instance)
- **Auth**: Bypassed for development

### Staging Environment
- **Worker**: `grassrootsmvt-staging.anchorskov.workers.dev`
- **UI**: `staging.grassrootsmvt.org`
- **Database**: `wy_staging` (separate D1 instance)
- **Auth**: Cloudflare Access (staging domain)

### Production Environment
- **Worker**: `grassrootsmvt.anchorskov.workers.dev`
- **UI**: `grassrootsmvt.org`
- **Database**: `wy` (production D1 instance)
- **Auth**: Cloudflare Access (production domain)

## Deployment Process

### 1. Database Migration (If Required)

#### Backup Production Database
```bash
# Create backup before any schema changes
npx wrangler d1 export wy --output=backup_pre_deploy_$(date +%Y%m%d_%H%M%S).sql

# Verify backup
ls -la backup_pre_deploy_*.sql
```

#### Apply Migrations
```bash
# Test migrations on staging first
npx wrangler d1 migrations apply wy_staging --remote

# Verify migration success
npx wrangler d1 execute wy_staging --remote --command="SELECT name FROM sqlite_master WHERE type='table';"

# Apply to production (after staging verification)
npx wrangler d1 migrations apply wy --remote
```

### 2. Worker Deployment

#### Deploy to Staging
```bash
cd worker

# Deploy to staging environment
npx wrangler deploy --env=staging

# Verify staging deployment
curl -f https://grassrootsmvt-staging.anchorskov.workers.dev/api/ping
```

#### Deploy to Production
```bash
# Deploy production Worker
npx wrangler deploy --env=production

# Verify production deployment immediately
curl -f https://grassrootsmvt.anchorskov.workers.dev/api/ping
curl -f https://grassrootsmvt.anchorskov.workers.dev/api/db/tables
```

### 3. Pages Deployment

#### Deploy UI to Staging
```bash
cd ui

# Deploy to staging Pages
npx wrangler pages deploy . --project-name=grassrootsmvt-staging --env=staging

# Verify staging Pages
curl -f https://staging.grassrootsmvt.org/
```

#### Deploy UI to Production
```bash
# Deploy production Pages
npx wrangler pages deploy . --project-name=grassrootsmvt --env=production

# Verify production Pages
curl -f https://grassrootsmvt.org/
```

### 4. Post-Deployment Verification

#### Automated Verification
```bash
# Run comprehensive deployment verification
./scripts/verify_deploy.mjs

# Check for route conflicts
./scripts/check_cf_routes_conflicts.mjs

# Test API endpoints
./scripts/test_api_endpoints.mjs --base=https://grassrootsmvt.org
```

#### Manual Verification
```bash
# Test critical endpoints
curl -H "Cf-Access-Authenticated-User-Email: volunteer@grassrootsmvt.org" \
     https://grassrootsmvt.org/api/whoami

# Test database connectivity
curl https://grassrootsmvt.org/api/db/tables

# Test voter search (requires auth)
curl -H "Authorization: Bearer test" \
     "https://grassrootsmvt.org/api/canvass/search?q=TEST"
```

## Deployment Scripts

### Automated Deployment Script
```bash
#!/usr/bin/env bash
# scripts/deploy_production.sh
set -euo pipefail

echo "🚀 Starting production deployment..."

# 1. Pre-deployment backup
echo "📦 Creating database backup..."
npx wrangler d1 export wy --output=backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Deploy Worker
echo "⚡ Deploying Worker..."
cd worker
npx wrangler deploy --env=production
cd ..

# 3. Deploy Pages
echo "📄 Deploying Pages..."
cd ui
npx wrangler pages deploy . --project-name=grassrootsmvt --env=production
cd ..

# 4. Verification
echo "✅ Verifying deployment..."
./scripts/verify_deploy.mjs

echo "🎉 Deployment complete!"
```

### Health Check Script
```bash
#!/usr/bin/env bash
# scripts/health_check.sh
set -euo pipefail

BASE="${1:-https://grassrootsmvt.org}"
TIMEOUT=30

echo "🏥 Health check for $BASE..."

# Basic connectivity
if ! curl -f --max-time $TIMEOUT "$BASE/api/ping" > /dev/null 2>&1; then
  echo "❌ Basic connectivity failed"
  exit 1
fi

# Database connectivity
if ! curl -f --max-time $TIMEOUT "$BASE/api/db/tables" > /dev/null 2>&1; then
  echo "❌ Database connectivity failed"
  exit 1
fi

# UI accessibility
if ! curl -f --max-time $TIMEOUT "$BASE/" > /dev/null 2>&1; then
  echo "❌ UI accessibility failed"
  exit 1
fi

echo "✅ All health checks passed"
```

## Rollback Procedures

### Worker Rollback

#### Quick Rollback (Dashboard)
1. Navigate to **Cloudflare Dashboard** → **Workers & Pages**
2. Select **grassrootsmvt** worker
3. Go to **Deployments** tab
4. Click **Rollback** on previous working version

#### CLI Rollback
```bash
# List recent deployments
npx wrangler deployments list

# Deploy specific previous version
npx wrangler deploy --env=production --compatibility-date=2025-10-09

# Or redeploy from previous commit
git checkout HEAD~1 -- worker/src/
npx wrangler deploy --env=production
git checkout HEAD -- worker/src/
```

### Pages Rollback
```bash
# Redeploy previous version
cd ui
git checkout HEAD~1 -- .
npx wrangler pages deploy . --project-name=grassrootsmvt --env=production
git checkout HEAD -- .
```

### Database Rollback
```bash
# Restore from backup (DESTRUCTIVE)
npx wrangler d1 execute wy --remote --file=backup_pre_deploy_20251010_143022.sql

# Or rollback specific migration
npx wrangler d1 migrations apply wy --remote --to=001
```

## Monitoring & Alerting

### Performance Monitoring

#### Worker Analytics
```bash
# Get real-time analytics
npx wrangler analytics --format=json --since=1h | jq '.[]'

# Monitor error rates
npx wrangler tail --status=error --format=pretty
```

#### Database Performance
```bash
# Monitor D1 query performance
npx wrangler d1 execute wy --remote --command="
  SELECT 
    COUNT(*) as total_calls,
    AVG(CASE WHEN created_at > datetime('now', '-1 hour') THEN 1 ELSE 0 END) as recent_activity
  FROM call_activity;
"
```

### Health Monitoring Script
```javascript
// scripts/monitor_health.mjs
import fetch from 'node-fetch';

const ENDPOINTS = [
  'https://grassrootsmvt.org/api/ping',
  'https://grassrootsmvt.org/api/db/tables',
  'https://grassrootsmvt.org/'
];

async function checkHealth() {
  const results = [];
  
  for (const url of ENDPOINTS) {
    const start = Date.now();
    try {
      const response = await fetch(url, { timeout: 10000 });
      const duration = Date.now() - start;
      
      results.push({
        url,
        status: response.status,
        ok: response.ok,
        duration
      });
    } catch (error) {
      results.push({
        url,
        status: 'error',
        ok: false,
        error: error.message
      });
    }
  }
  
  return results;
}

// Run health check
checkHealth().then(results => {
  const allHealthy = results.every(r => r.ok);
  
  console.log('Health Check Results:');
  results.forEach(r => {
    const status = r.ok ? '✅' : '❌';
    console.log(`${status} ${r.url} - ${r.status} (${r.duration || 'N/A'}ms)`);
  });
  
  process.exit(allHealthy ? 0 : 1);
});
```

### Automated Alerting
```bash
#!/usr/bin/env bash
# scripts/check_and_alert.sh
# Run this in cron every 5 minutes

if ! ./scripts/health_check.sh; then
  # Send alert (replace with your alerting system)
  curl -X POST "$SLACK_WEBHOOK_URL" \
    -H 'Content-type: application/json' \
    --data '{"text":"🚨 GrassrootsMVT health check failed!"}'
    
  # Log failure
  echo "$(date): Health check failed" >> /var/log/grassrootsmvt_alerts.log
fi
```

## Configuration Management

### Environment-Specific Secrets
```bash
# Production secrets
npx wrangler secret put CLOUDFLARE_API_TOKEN --env=production
npx wrangler secret put JWT_SECRET --env=production
npx wrangler secret put TEAM_DOMAIN --env=production

# Staging secrets  
npx wrangler secret put CLOUDFLARE_API_TOKEN --env=staging
npx wrangler secret put JWT_SECRET --env=staging
npx wrangler secret put TEAM_DOMAIN --env=staging
```

### Configuration Validation
```bash
# Validate production configuration
npx wrangler config --env=production

# Check environment variables
npx wrangler secret list --env=production
```

## Continuous Integration

### GitHub Actions Workflow
```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run tests
        run: npm test
        
      - name: Deploy Worker
        run: npx wrangler deploy --env=production
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          
      - name: Deploy Pages
        run: |
          cd ui
          npx wrangler pages deploy . --project-name=grassrootsmvt
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          
      - name: Verify deployment
        run: ./scripts/verify_deploy.mjs
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

## Disaster Recovery

### Backup Strategy
1. **Automated Backups**: Daily D1 database exports
2. **Code Backups**: Git repository with tags for releases
3. **Configuration Backups**: Cloudflare configuration exports

### Recovery Procedures
1. **Service Outage**: Rollback to previous working deployment
2. **Data Corruption**: Restore from most recent database backup
3. **Complete Failure**: Redeploy from scratch using disaster recovery documentation

### Recovery Testing
```bash
# Test backup restoration (on staging)
npx wrangler d1 execute wy_staging --remote --file=backup_20251010.sql

# Test complete redeployment
./scripts/deploy_from_scratch.sh --env=staging
```

## Security Considerations

### Deployment Security
- Use least-privilege API tokens
- Rotate secrets regularly
- Monitor deployment logs for anomalies
- Implement deployment approval workflows

### Runtime Security
- Enable Cloudflare Access for all production endpoints
- Implement rate limiting
- Monitor for suspicious activity
- Regular security audits

### Data Protection
- Encrypt sensitive data at rest
- Use HTTPS for all communications
- Implement proper CORS policies
- Regular backup verification