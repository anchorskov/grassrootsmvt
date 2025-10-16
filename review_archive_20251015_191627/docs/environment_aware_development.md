# Environment-Aware Development Guide

## Overview

GrassrootsMVT now supports seamless local development with automatic environment detection. The system automatically detects whether you're running locally or in production and adjusts behavior accordingly.

## Environment Detection

### Automatic Detection
The system automatically detects the environment based on:

- **Local Development**: `localhost`, `127.0.0.1`, or development ports (8787, 8788, 8080, 3000, 5173)
- **Production**: `grassrootsmvt.org` domains or `pages.dev` domains

### Manual Configuration
You can override detection with environment variables:
```bash
export ENVIRONMENT=local           # Force local mode
export LOCAL_DEVELOPMENT=true     # Force local mode
export DISABLE_AUTH=true          # Bypass authentication
```

## Key Features

### 1. Authentication Bypass
- **Local**: Authentication is completely bypassed - no Cloudflare Access required
- **Production**: Full Cloudflare Access authentication with team domain integration

### 2. API Endpoint Configuration
- **Local**: API calls go to `http://localhost:8787`
- **Production**: API calls go to `https://api.grassrootsmvt.org`

### 3. CORS Configuration
- **Local**: Allows `localhost:8788` and other development origins
- **Production**: Restricts to `volunteers.grassrootsmvt.org`

### 4. Debug Logging
- **Local**: Verbose console logging enabled
- **Production**: Minimal logging for performance

## Development Workflow

### Starting Local Development
```bash
# Start both Worker and Pages
npm run dev

# Or start individually
npm run dev:worker  # localhost:8787
npm run dev:pages   # localhost:8788
```

### Environment Variables
The development environment automatically sets:
```bash
NODE_ENV=development
ENVIRONMENT=local
LOCAL_DEVELOPMENT=true
DISABLE_AUTH=true
```

### Testing Authentication Bypass
```bash
# These should work without authentication in local mode
curl http://localhost:8787/api/whoami
curl http://localhost:8787/auth/config
curl http://localhost:8787/api/ping
```

## File Structure

### Core Configuration
- `ui/config/environments.js` - Environment detection and configuration
- `ui/src/apiClient.js` - Environment-aware API client
- `worker/src/index.js` - Environment-aware Worker with auth bypass
- `ui/index.html` - Environment-aware UI initialization

### Development Scripts
- `scripts/dev_start.sh` - Enhanced startup with environment setup
- `scripts/dev_stop.sh` - Clean shutdown
- `package.json` - Updated with environment-aware scripts

## Configuration Details

### Environment Config Object
```javascript
{
  environment: 'local' | 'production',
  isLocal: boolean,
  api: {
    baseUrl: 'http://localhost:8787' | 'https://api.grassrootsmvt.org',
    endpoints: { ... }
  },
  auth: {
    enabled: boolean,
    bypassAuthentication: boolean,
    testMode: boolean
  },
  debug: {
    enabled: boolean,
    verbose: boolean
  }
}
```

### API Client Features
- Automatic endpoint resolution
- Authentication bypass for local development
- Environment-specific error handling
- Debug logging integration

### Worker Features
- Environment detection via variables and hostname
- Local authentication bypass with mock user
- Environment-specific CORS policies
- Debug logging for development

## Migration from Hardcoded URLs

### Before (Hardcoded)
```javascript
const API_BASE = 'https://api.grassrootsmvt.org';
fetch(`${API_BASE}/api/whoami`);
```

### After (Environment-Aware)
```javascript
import environmentConfig from './config/environments.js';
const apiUrl = environmentConfig.getApiUrl('whoami');
fetch(apiUrl);
```

## Troubleshooting

### Common Issues

1. **CORS Errors in Local Development**
   - Ensure Worker is running with `ALLOW_ORIGIN=http://localhost:8788`
   - Check that environment detection is working

2. **Authentication Not Bypassed**
   - Verify `ENVIRONMENT=local` is set
   - Check browser console for environment detection logs

3. **API Calls Failing**
   - Ensure both Worker (8787) and Pages (8788) are running
   - Check that API client is using correct localhost URLs

### Debug Commands
```bash
# Check environment detection
curl http://localhost:8787/auth/config

# Verify API client configuration
# (Check browser console for environment logs)

# Test authentication bypass
curl http://localhost:8787/api/whoami
```

## Production Deployment

The system maintains full production compatibility:
- All environment detection happens client-side
- Production builds work unchanged
- Cloudflare Access integration remains intact
- No additional deployment steps required

### Deployment Verification
After deployment, verify:
1. Environment detection shows 'production'
2. Authentication redirects to Cloudflare Access
3. API calls use production URLs
4. Debug logging is disabled

## Best Practices

1. **Always use environment config for URLs**
   ```javascript
   // Good
   const apiUrl = environmentConfig.getApiUrl('endpoint');
   
   // Bad
   const apiUrl = 'https://api.grassrootsmvt.org/endpoint';
   ```

2. **Use debug logging for development**
   ```javascript
   environmentConfig.debug('API call', { endpoint, params });
   ```

3. **Test both environments**
   - Test locally with authentication bypass
   - Test production deployment with full authentication

4. **Keep environment-specific code minimal**
   - Use configuration objects instead of conditional logic
   - Centralize environment detection in `environments.js`