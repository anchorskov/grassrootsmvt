#!/usr/bin/env node

/**
 * Authentication Integration Verification Script
 * 
 * This script verifies that the JWT authentication integration is working
 * correctly with the production API endpoints and UI components.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';

const PROD_API = 'https://api.grassrootsmvt.org';
const LOCAL_API = 'http://localhost:8787';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

/**
 * Check if file contains required authentication functions
 */
async function verifyAuthenticationFunctions() {
  log('\n🔐 Verifying Authentication Functions...', colors.blue);
  
  try {
    const apiClientPath = join(process.cwd(), 'ui/src/apiClient.js');
    const content = await readFile(apiClientPath, 'utf-8');
    
    const requiredFunctions = [
      'getJWTToken',
      'authenticatedFetch',
      'redirectToLogin',
      'retryableAPICall',
      'showToast',
      'getAuthStatus',
      'isLocalDevelopment'
    ];
    
    const foundFunctions = [];
    const missingFunctions = [];
    
    for (const func of requiredFunctions) {
      if (content.includes(`function ${func}`) || content.includes(`const ${func} =`) || content.includes(`export function ${func}`)) {
        foundFunctions.push(func);
        log(`  ✅ ${func}`, colors.green);
      } else {
        missingFunctions.push(func);
        log(`  ❌ ${func}`, colors.red);
      }
    }
    
    // Check for JWT-specific code
    const jwtChecks = [
      { name: 'CF_Authorization cookie extraction', pattern: 'CF_Authorization=' },
      { name: 'Cf-Access-Jwt-Assertion header', pattern: 'Cf-Access-Jwt-Assertion' },
      { name: 'Cloudflare Access login redirect', pattern: '/cdn-cgi/access/login' },
      { name: 'Local development detection', pattern: 'localhost' },
      { name: 'Authentication retry logic', pattern: 'authRetryCount' }
    ];
    
    log('\n🔍 JWT Integration Features:', colors.cyan);
    for (const check of jwtChecks) {
      if (content.includes(check.pattern)) {
        log(`  ✅ ${check.name}`, colors.green);
      } else {
        log(`  ❌ ${check.name}`, colors.red);
      }
    }
    
    if (missingFunctions.length === 0) {
      log('\n✅ All authentication functions present', colors.green);
      return true;
    } else {
      log(`\n❌ Missing functions: ${missingFunctions.join(', ')}`, colors.red);
      return false;
    }
    
  } catch (error) {
    log(`❌ Error reading apiClient.js: ${error.message}`, colors.red);
    return false;
  }
}

/**
 * Verify UI pages have authentication integration
 */
async function verifyUIIntegration() {
  log('\n🖥️ Verifying UI Authentication Integration...', colors.blue);
  
  const uiFiles = [
    { path: 'ui/volunteer/index.html', name: 'Volunteer Portal' },
    { path: 'ui/volunteer/phone.html', name: 'Phone Banking' },
    { path: 'ui/volunteer/canvass.html', name: 'Canvassing' }
  ];
  
  let allGood = true;
  
  for (const file of uiFiles) {
    try {
      const content = await readFile(join(process.cwd(), file.path), 'utf-8');
      
      log(`\n📄 ${file.name}:`, colors.cyan);
      
      // Check for authentication imports
      const authImports = [
        'authenticatedFetch',
        'getAuthStatus',
        'showToast'
      ];
      
      let importsFound = 0;
      for (const importName of authImports) {
        if (content.includes(importName)) {
          log(`  ✅ Imports ${importName}`, colors.green);
          importsFound++;
        } else {
          log(`  ❌ Missing import: ${importName}`, colors.red);
        }
      }
      
      // Check for authentication usage
      const authUsage = [
        { name: 'Authentication check', pattern: 'checkAuthentication' },
        { name: 'Auth status display', pattern: 'authStatus' },
        { name: 'Error handling', pattern: 'Authentication' }
      ];
      
      for (const usage of authUsage) {
        if (content.includes(usage.pattern)) {
          log(`  ✅ ${usage.name}`, colors.green);
        } else {
          log(`  ⚠️ No ${usage.name}`, colors.yellow);
        }
      }
      
      if (importsFound < authImports.length) {
        allGood = false;
      }
      
    } catch (error) {
      log(`❌ Error reading ${file.path}: ${error.message}`, colors.red);
      allGood = false;
    }
  }
  
  return allGood;
}

/**
 * Check service worker offline integration
 */
async function verifyOfflineIntegration() {
  log('\n📱 Verifying Offline Integration...', colors.blue);
  
  try {
    const swPath = join(process.cwd(), 'ui/sw.js');
    const content = await readFile(swPath, 'utf-8');
    
    const offlineFeatures = [
      { name: 'Background sync', pattern: 'addEventListener(\'sync\'' },
      { name: 'IndexedDB integration', pattern: 'idb.js' },
      { name: 'Submission queue', pattern: 'QUEUE_SUBMISSION' },
      { name: 'Sync event handler', pattern: 'sync' },
      { name: 'Message passing', pattern: 'postMessage' }
    ];
    
    let featuresFound = 0;
    for (const feature of offlineFeatures) {
      if (content.includes(feature.pattern)) {
        log(`  ✅ ${feature.name}`, colors.green);
        featuresFound++;
      } else {
        log(`  ❌ ${feature.name}`, colors.red);
      }
    }
    
    // Check IndexedDB helper
    try {
      const idbPath = join(process.cwd(), 'ui/src/idb.js');
      const idbContent = await readFile(idbPath, 'utf-8');
      
      const idbFunctions = ['openDB', 'savePending', 'getPending', 'clearPending'];
      let idbFunctionsFound = 0;
      
      log('\n📦 IndexedDB Helper:', colors.cyan);
      for (const func of idbFunctions) {
        if (idbContent.includes(func)) {
          log(`  ✅ ${func}`, colors.green);
          idbFunctionsFound++;
        } else {
          log(`  ❌ ${func}`, colors.red);
        }
      }
      
      return featuresFound >= 4 && idbFunctionsFound >= 3;
    } catch (error) {
      log(`❌ Error reading idb.js: ${error.message}`, colors.red);
      return false;
    }
    
  } catch (error) {
    log(`❌ Error reading service worker: ${error.message}`, colors.red);
    return false;
  }
}

/**
 * Test API endpoint accessibility (basic connectivity)
 */
async function testAPIConnectivity() {
  log('\n🌐 Testing API Connectivity...', colors.blue);
  
  const endpoints = [
    { url: `${PROD_API}/api/ping`, name: 'Production API Health' },
    { url: `${LOCAL_API}/api/ping`, name: 'Local API Health' }
  ];
  
  let anyWorking = false;
  
  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(endpoint.url, {
        signal: controller.signal,
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        log(`  ✅ ${endpoint.name}`, colors.green);
        anyWorking = true;
      } else {
        log(`  ⚠️ ${endpoint.name} - HTTP ${response.status}`, colors.yellow);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        log(`  ⏰ ${endpoint.name} - Timeout`, colors.yellow);
      } else {
        log(`  ❌ ${endpoint.name} - ${error.message}`, colors.red);
      }
    }
  }
  
  return anyWorking;
}

/**
 * Verify PWA assets and configuration
 */
async function verifyPWAAssets() {
  log('\n📱 Verifying PWA Assets...', colors.blue);
  
  const pwaAssets = [
    { path: 'ui/favicon.ico', name: 'Favicon ICO' },
    { path: 'ui/favicon.svg', name: 'Favicon SVG' },
    { path: 'ui/manifest.json', name: 'Web App Manifest' },
    { path: 'ui/sw.js', name: 'Service Worker' }
  ];
  
  let allPresent = true;
  
  for (const asset of pwaAssets) {
    try {
      await readFile(join(process.cwd(), asset.path));
      log(`  ✅ ${asset.name}`, colors.green);
    } catch (error) {
      log(`  ❌ ${asset.name} - Not found`, colors.red);
      allPresent = false;
    }
  }
  
  // Check manifest content
  try {
    const manifestPath = join(process.cwd(), 'ui/manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
    
    log('\n📋 Manifest Validation:', colors.cyan);
    const requiredFields = ['name', 'short_name', 'start_url', 'display', 'theme_color'];
    
    for (const field of requiredFields) {
      if (manifest[field]) {
        log(`  ✅ ${field}: ${manifest[field]}`, colors.green);
      } else {
        log(`  ❌ Missing ${field}`, colors.red);
        allPresent = false;
      }
    }
  } catch (error) {
    log(`❌ Error reading manifest: ${error.message}`, colors.red);
    allPresent = false;
  }
  
  return allPresent;
}

/**
 * Generate comprehensive test report
 */
async function generateTestReport() {
  log('🧪 GRASSROOTSMVT AUTHENTICATION & INTEGRATION VERIFICATION', colors.cyan);
  log('================================================================', colors.cyan);
  
  const results = {
    authFunctions: await verifyAuthenticationFunctions(),
    uiIntegration: await verifyUIIntegration(),
    offlineIntegration: await verifyOfflineIntegration(),
    apiConnectivity: await testAPIConnectivity(),
    pwaAssets: await verifyPWAAssets()
  };
  
  log('\n📊 VERIFICATION SUMMARY:', colors.blue);
  log('========================', colors.blue);
  
  Object.entries(results).forEach(([test, passed]) => {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    const color = passed ? colors.green : colors.red;
    log(`${status} ${test.replace(/([A-Z])/g, ' $1').toLowerCase()}`, color);
  });
  
  const overallPass = Object.values(results).every(result => result);
  
  log('\n🎯 OVERALL STATUS:', colors.blue);
  if (overallPass) {
    log('✅ ALL SYSTEMS GO - Production Ready!', colors.green);
    log('\n🚀 Ready for deployment with:', colors.green);
    log('   • JWT Authentication via Cloudflare Access', colors.green);
    log('   • Offline submission queue with background sync', colors.green);
    log('   • PWA capabilities with service worker', colors.green);
    log('   • Error handling and retry logic', colors.green);
    log('   • Toast notifications for user feedback', colors.green);
  } else {
    log('❌ ISSUES FOUND - Review and fix before production', colors.red);
    log('\n⚠️ Address the failed checks above before deploying', colors.yellow);
  }
  
  return overallPass;
}

/**
 * Main execution
 */
async function main() {
  try {
    const success = await generateTestReport();
    process.exit(success ? 0 : 1);
  } catch (error) {
    log(`💥 Fatal error: ${error.message}`, colors.red);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  verifyAuthenticationFunctions,
  verifyUIIntegration,
  verifyOfflineIntegration,
  testAPIConnectivity,
  verifyPWAAssets
};