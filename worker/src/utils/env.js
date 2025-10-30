// Environment detection utilities for Worker
// Determines local vs production mode and config

// Returns true if running in local development (wrangler dev, env vars, etc)
export function isLocalDevelopment(env) {
  // Primary check: explicit environment setting
  if (env.ENVIRONMENT === 'production') {
    return false;
  }
  // Check for local development indicators
  const hasLocalEnvVars = (
    env.ENVIRONMENT === 'local' ||
    env.ENVIRONMENT === 'development' ||
    env.LOCAL_DEVELOPMENT === 'true' ||
    env.DISABLE_AUTH === 'true'
  );
  // Detect wrangler dev environment by checking for production-specific vars
  const isWranglerDev = (
    typeof env.CF_ZONE_ID === 'undefined' && 
    typeof env.CF_ACCOUNT_ID === 'undefined' &&
    typeof env.CLOUDFLARE_ACCOUNT_ID === 'undefined'
  );
  return hasLocalEnvVars || isWranglerDev;
}

import { parseAllowedOrigins } from './cors.js';

// Returns environment config object (local/production, auth, allowed origins, debug)
export function getEnvironmentConfig(env) {
  const isLocal = isLocalDevelopment(env);
  return {
    environment: isLocal ? 'local' : 'production',
    isLocal: isLocal,
    auth: {
      enabled: !isLocal,
      bypassAuthentication: isLocal
    },
    allowedOrigins: parseAllowedOrigins(env),
    debug: isLocal
  };
}
