# GrassrootsMVT - Project Overview

## Purpose
GrassrootsMVT is a **grassroots voter outreach platform** designed for political campaigns and advocacy organizations. The system enables volunteers to conduct phone canvassing operations with real-time voter data, call tracking, and volunteer coordination.

## Architecture Overview

### Core Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Volunteers    │    │  Campaign       │    │  Data           │
│   (Frontend)    │────│  Workers        │────│  (Cloudflare    │
│                 │    │  (API/Auth)     │    │   D1 Database)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Technology Stack

- **Frontend**: Cloudflare Pages (Vanilla HTML/JS)
- **Backend**: Cloudflare Workers (JavaScript ES2022)
- **Database**: Cloudflare D1 (SQLite-compatible)
- **Authentication**: Cloudflare Access + JWT
- **Development**: Wrangler CLI

### Current Architecture Status
✅ **Complete Worker Implementation** - Fully functional with all APIs restored
✅ **Database Integration** - D1 bindings configured with performance optimization
✅ **API Endpoints** - Complete volunteer engagement API (/api/call, /api/canvass, /api/pulse, /api/templates)
✅ **Authentication Framework** - Cloudflare Access + JWT integration implemented
⚠️ **UI Integration** - Frontend requires API connection (APIs exist, UI uses placeholders)
⚠️ **Production Deployment** - Blocked by frontend JWT integration

## Key Features

### For Volunteers
- **Phone Banking Interface**: Streamlined UI for making voter contact calls
- **Real-time Voter Data**: Access to voter registration, party affiliation, contact history
- **Call Result Tracking**: Log call outcomes, notes, follow-up requirements
- **Geographic Targeting**: Filter by county, legislative district, precinct

### For Campaign Management  
- **Volunteer Coordination**: Assign call lists, track volunteer productivity
- **Data Analytics**: Call completion rates, contact success metrics
- **Voter Database Management**: Import/export voter files, data normalization
- **Access Control**: Role-based permissions via Cloudflare Access

### For System Administration
- **Deployment Automation**: CI/CD with verification scripts
- **Database Migration**: Schema versioning and data seeding tools  
- **Monitoring**: Health checks, error tracking, performance metrics
- **Security**: JWT-based authentication, CORS policies

## Data Model

### Core Entities
- **Voters**: Primary voter registration data (ID, party, address, district)
- **Voter Normalization**: Cleaned/standardized voter data  
- **Best Phone**: Preferred contact numbers per voter
- **Call Activity**: Volunteer call logs and outcomes
- **Volunteers**: User authentication and access control

### Database Schema
```sql
-- Core voter data
CREATE TABLE voters (
  voter_id TEXT PRIMARY KEY,
  political_party TEXT,
  county TEXT,
  senate TEXT,
  house TEXT
);

-- Call tracking
CREATE TABLE call_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voter_id TEXT,
  volunteer_email TEXT,
  call_result TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Environment Configuration

### Local Development
- **Worker**: `localhost:8787` (wrangler dev)
- **UI**: `localhost:8788` (wrangler pages dev)  
- **Database**: `wy_preview` (50 test records)

### Production
- **Worker**: `grassrootsmvt.anchorskov.workers.dev`
- **UI**: `grassrootsmvt.org`
- **Database**: `wy` (274,656+ voter records)

## Security Model

### Authentication Flow
1. User accesses application via Cloudflare Access
2. Access validates identity and issues JWT
3. Worker verifies JWT on protected endpoints
4. Database operations executed with user context

### Authorization Levels
- **Public**: Health checks, basic info endpoints
- **Volunteer**: Voter search, call logging
- **Admin**: Data management, volunteer coordination  
- **System**: Database migrations, deployments

## Development Workflow

### Local Setup
```bash
# Start Worker development
cd worker && npx wrangler dev

# Start UI development  
cd ui && npx wrangler pages dev . --port=8788

# Seed local database
./scripts/seed_local_d1.sh

# Test API endpoints
./scripts/test_api_endpoints.mjs
```

### Deployment
```bash
# Deploy Worker
cd worker && npx wrangler deploy

# Deploy Pages
cd ui && npx wrangler pages deploy . --project-name=grassrootsmvt

# Verify deployment
./scripts/verify_deploy.mjs
```

## Recent Migration

The project recently underwent a **major architectural migration**:

### Before (Pages Functions)
- Complex routing through Cloudflare Pages Functions
- Worker/Pages hybrid causing conflicts
- Authentication/routing issues

### After (Pure Workers)  
- Simplified Worker-only API architecture
- Clean separation of concerns
- Gradual feature restoration approach

### Migration Artifacts
- **Backup**: `temp_api_backup/` contains full previous implementation
- **Archive**: `grassrootsmvt_local_review.zip` deployment package
- **Documentation**: `MIGRATION_PLAN.md` with detailed steps

## Next Steps

1. **Complete Frontend Integration** - Connect UI to existing production APIs
2. **Implement JWT Authentication** - Add Cloudflare Access token handling in UI  
3. **Production Deployment** - Deploy integrated volunteer portal
4. **Volunteer Onboarding** - Launch with volunteer training and documentation
5. **Monitoring & Analytics** - Implement usage tracking and performance monitoring

## Support & Resources

- **Repository**: https://github.com/anchorskov/grassrootsmvt
- **Migration Plan**: [MIGRATION_PLAN.md](../MIGRATION_PLAN.md)
- **Development Journal**: [journal.md](./journal.md)
- **Troubleshooting**: [troubleshooting.md](./troubleshooting.md)