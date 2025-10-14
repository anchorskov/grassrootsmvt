# Wrangler Configuration Guide - GrassrootsMVT

## Overview
This guide covers Wrangler CLI setup, configuration files, and development workflows for the GrassrootsMVT project.

## Installation & Setup

### Wrangler Installation
```bash
# Install globally
npm install -g wrangler@latest

# Or use project-specific version
npm install wrangler@4.42.1 --save-dev
npx wrangler --version
```

### Authentication
```bash
# Login to Cloudflare
npx wrangler auth login

# Verify authentication
npx wrangler whoami

# Alternative: API token authentication
export CLOUDFLARE_API_TOKEN="your_token_here"
```

## Configuration Files

### Worker Configuration (`worker/wrangler.toml`)

```toml
# 🏷️ worker/wrangler.toml
# Cloudflare Worker configuration for grassrootsmvt
name = "grassrootsmvt"
account_id = "8bfd3f60fbdcc89183e9e312fb03e86e"
main = "src/index.js"
compatibility_date = "2025-10-08"
workers_dev = true

# 🌍 Shared Environment Variables
[vars]
ENVIRONMENT = "local"
ALLOW_ORIGIN = "http://localhost:8788"
DATA_BACKEND = "d1"
ACCESS_HEADER = "Cf-Access-Authenticated-User-Email"
ACCESS_JWT_HEADER = "Cf-Access-Jwt-Assertion"
ALLOWED_EMAILS = "volunteer@grassrootsmvt.org,admin@grassrootsmvt.org"
DEBUG_CORS = "true"

# 🗄️ Default D1 database (local/preview)
[[d1_databases]]
binding = "wy_preview"
database_name = "wy_preview"
database_id = "de78cb41-176d-40e8-bd3b-e053e347ac3f"
migrations_dir = "db/migrations"

# 🌐 Production Environment
[env.production]
ENVIRONMENT = "production"
ALLOW_ORIGIN = "https://grassrootsmvt.org"

[[env.production.d1_databases]]
binding = "wy"
database_name = "wy"
database_id = "4b4227f1-bf30-4fcf-8a08-6967b536a5ab"
migrations_dir = "db/migrations"
```

### UI Configuration (`ui/package.json`)

```json
{
  "name": "grassrootsmvt-ui",
  "version": "1.0.0",
  "scripts": {
    "dev": "npx wrangler pages dev . --port=8788",
    "deploy": "npx wrangler pages deploy . --project-name=grassrootsmvt",
    "build": "echo 'Static site - no build step required'"
  }
}
```

### Environment Variables (`.dev.vars`)

```bash
# .dev.vars - Local development variables (DO NOT COMMIT)
CLOUDFLARE_API_TOKEN=your_token_here
CLOUDFLARE_ACCOUNT_ID=8bfd3f60fbdcc89183e9e312fb03e86e
PROJECT=grassrootsmvt

# JWT Configuration (for production)
TEAM_DOMAIN=your-team.cloudflareaccess.com
APPLICATION_AUD=your_application_audience_id
JWT_SECRET=your_jwt_secret

# Database Configuration
DB_ENVIRONMENT=local
ENABLE_DEBUG_LOGGING=true
```

## Development Workflows

### Local Development

#### Start Worker Development Server
```bash
cd worker
npx wrangler dev

# With specific port and environment
npx wrangler dev --port=8787 --env=local

# With verbose logging
npx wrangler dev --log-level=debug
```

#### Start Pages Development Server
```bash
cd ui
npx wrangler pages dev . --port=8788

# With specific compatibility flags
npx wrangler pages dev . --compatibility-date=2025-10-08
```

#### Run Both Services
```bash
# Terminal 1: Worker
cd worker && npx wrangler dev

# Terminal 2: UI
cd ui && npx wrangler pages dev . --port=8788

# Terminal 3: Testing
./scripts/test_api_endpoints.mjs
```

### Database Operations

#### D1 Database Management
```bash
# List databases
npx wrangler d1 list

# Create new database
npx wrangler d1 create grassrootsmvt-test

# Execute SQL commands
npx wrangler d1 execute wy_preview --local --command="SELECT COUNT(*) FROM voters;"
npx wrangler d1 execute wy --remote --command="SELECT COUNT(*) FROM voters;"

# Run SQL from file
npx wrangler d1 execute wy_preview --local --file=./db/migrations/001_initial.sql
```

#### Database Migrations
```bash
# Generate new migration
npx wrangler d1 migrations create wy_preview "add_call_notes_column"

# Apply migrations locally
npx wrangler d1 migrations apply wy_preview --local

# Apply migrations to production
npx wrangler d1 migrations apply wy --remote

# List applied migrations
npx wrangler d1 migrations list wy_preview --local
```

#### Database Backup & Import
```bash
# Export database
npx wrangler d1 export wy --output=backup_$(date +%Y%m%d).sql

# Import from SQL file
npx wrangler d1 execute wy_preview --local --file=backup_20251010.sql

# Copy production data to local
npx wrangler d1 export wy --output=temp_prod_export.sql
npx wrangler d1 execute wy_preview --local --file=temp_prod_export.sql
```

### Deployment Operations

#### Worker Deployment
```bash
cd worker

# Deploy to production
npx wrangler deploy

# Deploy to specific environment
npx wrangler deploy --env=production

# Deploy with name override
npx wrangler deploy --name=grassrootsmvt-staging
```

#### Pages Deployment
```bash
cd ui

# Deploy to Pages
npx wrangler pages deploy . --project-name=grassrootsmvt

# Deploy with commit message
npx wrangler pages deploy . --project-name=grassrootsmvt --commit-dirty=true

# Deploy to specific environment
npx wrangler pages deploy . --project-name=grassrootsmvt --env=staging
```

### Monitoring & Debugging

#### Logs & Monitoring
```bash
# Tail Worker logs in real-time
npx wrangler tail

# Tail with filters
npx wrangler tail --format=pretty --status=error

# Get analytics data
npx wrangler analytics --format=json --since=1h
```

#### Secret Management
```bash
# Set secrets
npx wrangler secret put JWT_SECRET
npx wrangler secret put CLOUDFLARE_API_TOKEN

# List secrets (names only)
npx wrangler secret list

# Delete secret
npx wrangler secret delete OLD_SECRET_NAME
```

## Environment Configuration

### Local Development Environment
```bash
# Environment-specific configuration
[env.local]
ENVIRONMENT = "local"
ALLOW_ORIGIN = "http://localhost:8788"
DEBUG_MODE = true

[[env.local.d1_databases]]
binding = "wy_preview"
database_name = "wy_preview" 
database_id = "de78cb41-176d-40e8-bd3b-e053e347ac3f"
```

### Staging Environment
```bash
[env.staging]
ENVIRONMENT = "staging"
ALLOW_ORIGIN = "https://staging.grassrootsmvt.org"
DEBUG_MODE = false

[[env.staging.d1_databases]]
binding = "wy"
database_name = "wy_staging"
database_id = "staging_database_id"
```

### Production Environment
```bash
[env.production]
ENVIRONMENT = "production"
ALLOW_ORIGIN = "https://grassrootsmvt.org"
DEBUG_MODE = false

[[env.production.d1_databases]]
binding = "wy"
database_name = "wy"
database_id = "4b4227f1-bf30-4fcf-8a08-6967b536a5ab"
```

## Advanced Configuration

### Custom Routes
```bash
# wrangler.toml route configuration
[[routes]]
pattern = "grassrootsmvt.org/api/*"
zone_name = "grassrootsmvt.org"

[[routes]]
pattern = "api.grassrootsmvt.org/*"
zone_name = "grassrootsmvt.org"
```

### Compatibility Flags
```bash
[compatibility_flags]
# Enable experimental features
experimental_modules = true
formdata_parser_supports_files = true
```

### Build Configuration
```bash
[build]
command = "npm run build"
cwd = "worker"
watch_dir = "src"

[upload]
format = "modules"
dir = "dist"
main = "./index.js"
```

## Troubleshooting

### Common Issues

#### 1. Authentication Errors
```bash
# Re-authenticate
npx wrangler auth login

# Check current user
npx wrangler whoami

# Use API token instead
export CLOUDFLARE_API_TOKEN="your_token"
```

#### 2. D1 Database Connection Issues
```bash
# Verify database exists
npx wrangler d1 list

# Check database ID
npx wrangler d1 info wy_preview

# Test connection
npx wrangler d1 execute wy_preview --local --command="SELECT 1;"
```

#### 3. Development Server Issues
```bash
# Clear Wrangler cache
rm -rf .wrangler/

# Restart with verbose logging
npx wrangler dev --log-level=debug

# Check port conflicts
lsof -i :8787
```

#### 4. Deployment Failures
```bash
# Check account and project settings
npx wrangler whoami

# Verify wrangler.toml syntax
npx wrangler config

# Check deployment status
npx wrangler deployments list
```

### Debug Commands

```bash
# Configuration validation
npx wrangler config

# Environment variable inspection
npx wrangler secret list

# Network diagnostics
npx wrangler tail --format=json | jq '.'

# Performance monitoring
npx wrangler analytics --format=pretty
```

## Best Practices

### Configuration Management
1. **Environment Separation**: Use separate configs for local, staging, production
2. **Secret Security**: Never commit `.dev.vars` or production secrets
3. **Version Pinning**: Lock Wrangler version in package.json
4. **Compatibility**: Set explicit compatibility_date

### Development Workflow
1. **Local Testing**: Always test locally before deployment
2. **Migration Strategy**: Test D1 migrations on preview database first
3. **Incremental Deployment**: Deploy Workers before Pages when both change
4. **Monitoring**: Enable logging and monitoring from day one

### Security Considerations
1. **API Token Scope**: Use minimal permissions for API tokens
2. **Environment Variables**: Separate sensitive data by environment
3. **Access Control**: Configure Cloudflare Access before going live
4. **Regular Updates**: Keep Wrangler and dependencies updated