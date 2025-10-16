/**
 * Environment detection and configuration system for GrassrootsMVT
 * Automatically detects localhost vs production and provides appropriate configuration
 */

class EnvironmentConfig {
  constructor() {
    this.environment = this.detectEnvironment();
    this.config = this.getConfigForEnvironment();
  }

  /**
   * Detect if running in local development or production
   * @returns {string} 'local' or 'production'
   */
  detectEnvironment() {
    if (typeof window !== 'undefined') {
      // Browser environment
      const hostname = window.location.hostname;
      const port = window.location.port;
      
      // Local development indicators
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.')) {
        return 'local';
      }
      
      // Common development ports
      if (port === '8788' || port === '8080' || port === '3000' || port === '5173') {
        return 'local';
      }
      
      // Production domains
      if (hostname.includes('grassrootsmvt.org') || hostname.includes('pages.dev')) {
        return 'production';
      }
    }
    
    // Node.js environment (for scripts)
    if (typeof process !== 'undefined' && process.env) {
      if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'local') {
        return 'local';
      }
      if (process.env.NODE_ENV === 'production') {
        return 'production';
      }
    }
    
    // Default to production for safety
    return 'production';
  }

  /**
   * Get configuration based on detected environment
   * @returns {object} Environment-specific configuration
   */
  getConfigForEnvironment() {
    const baseConfig = {
      environment: this.environment,
      isLocal: this.environment === 'local',
      isProduction: this.environment === 'production'
    };

    if (this.environment === 'local') {
      return {
        ...baseConfig,
        api: {
          baseUrl: 'http://localhost:8787',
          endpoints: {
            ping: '/api/ping',
            voters: '/api/voters',
            neighborhoods: '/api/neighborhoods',
            log: '/api/log',
            call: '/api/call',
            whoami: '/api/whoami',
            metadata: '/api/metadata',
            'contact-staging': '/api/contact-staging'
          }
        },
        ui: {
          baseUrl: 'http://localhost:8788',
          hostname: 'localhost:8788'
        },
        auth: {
          enabled: false,
          bypassAuthentication: true,
          testMode: true,
          mockUser: {
            email: 'dev@localhost',
            name: 'Local Developer'
          }
        },
        cors: {
          origin: 'http://localhost:8788',
          credentials: true
        },
        debug: {
          enabled: true,
          verbose: true,
          logLevel: 'debug'
        }
      };
    } else {
      return {
        ...baseConfig,
        api: {
          baseUrl: 'https://api.grassrootsmvt.org',
          endpoints: {
            ping: '/api/ping',
            voters: '/api/voters',
            neighborhoods: '/api/neighborhoods',
            log: '/api/log',
            call: '/api/call',
            whoami: '/api/whoami',
            metadata: '/api/metadata',
            'contact-staging': '/api/contact-staging'
          }
        },
        ui: {
          baseUrl: 'https://volunteers.grassrootsmvt.org',
          hostname: 'volunteers.grassrootsmvt.org'
        },
        auth: {
          enabled: true,
          bypassAuthentication: false,
          testMode: false,
          cloudflareAccess: {
            teamDomain: 'skovgard.cloudflareaccess.com',
            aud: '76fea0745afec089a3eddeba8d982b10aab6d6f871e43661cb4977765b78f3f0'
          }
        },
        cors: {
          origin: 'https://volunteers.grassrootsmvt.org',
          credentials: true
        },
        debug: {
          enabled: false,
          verbose: false,
          logLevel: 'warn'
        }
      };
    }
  }

  /**
   * Get API URL for a specific endpoint
   * @param {string} endpoint - Endpoint name (ping, voters, etc.)
   * @param {object} params - URL parameters
   * @returns {string} Full API URL
   */
  getApiUrl(endpoint, params = {}) {
    const baseUrl = this.config.api.baseUrl;
    // Look up endpoint path, or default to /api/ + endpoint
    const endpointPath = this.config.api.endpoints[endpoint] || 
                        (endpoint.startsWith('/') ? endpoint : `/api/${endpoint}`);
    
    let url = `${baseUrl}${endpointPath}`;
    
    // Add query parameters
    if (Object.keys(params).length > 0) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }
    
    return url;
  }

  /**
   * Get UI URL with optional path
   * @param {string} path - Optional path to append
   * @returns {string} Full UI URL
   */
  getUiUrl(path = '') {
    return `${this.config.ui.baseUrl}${path}`;
  }

  /**
   * Check if authentication should be bypassed
   * @returns {boolean} True if auth should be bypassed
   */
  shouldBypassAuth() {
    return this.config.auth.bypassAuthentication;
  }

  /**
   * Get authentication configuration
   * @returns {object} Auth configuration
   */
  getAuthConfig() {
    return this.config.auth;
  }

  /**
   * Log debug message if debug is enabled
   * @param {string} message - Message to log
   * @param {any} data - Optional data to log
   */
  debug(message, data = null) {
    if (this.config.debug.enabled) {
      console.log(`[ENV-${this.environment.toUpperCase()}] ${message}`, data || '');
    }
  }

  /**
   * Log error message
   * @param {string} message - Error message
   * @param {any} error - Optional error object
   */
  error(message, error = null) {
    console.error(`[ENV-${this.environment.toUpperCase()}] ${message}`, error || '');
  }
}

// Global instance
const environmentConfig = new EnvironmentConfig();

// Global browser access
if (typeof window !== 'undefined') {
  window.GrassrootsEnv = environmentConfig;
  window.environmentConfig = environmentConfig;
  window.EnvironmentConfig = EnvironmentConfig;
}

// CommonJS (for server-side usage)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = environmentConfig;
}