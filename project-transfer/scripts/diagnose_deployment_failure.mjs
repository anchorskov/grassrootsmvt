#!/usr/bin/env node

/**
 * GitHub Actions Deployment Failure Diagnostic Tool
 * Helps identify common issues with Cloudflare deployment workflows
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🔍 GitHub Actions Deployment Failure Diagnostic Tool');
console.log('=' .repeat(60));

// Check 1: Repository secrets
console.log('\n1. 📋 Required Repository Secrets Check');
console.log('-'.repeat(40));

const requiredSecrets = [
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID'
];

const optionalSecrets = [
  'CF_ACCESS_JWT'
];

console.log('❗ The following secrets must be configured in GitHub repository settings:');
console.log('   Repository → Settings → Secrets and variables → Actions');
console.log('');

requiredSecrets.forEach(secret => {
  console.log(`   ⚠️  REQUIRED: ${secret}`);
});

optionalSecrets.forEach(secret => {
  console.log(`   ℹ️  OPTIONAL: ${secret}`);
});

console.log('\n📋 Current local environment variables:');
requiredSecrets.forEach(secret => {
  const value = process.env[secret];
  if (value) {
    console.log(`   ✅ ${secret}: ********** (${value.length} chars)`);
  } else {
    console.log(`   ❌ ${secret}: Not set locally`);
  }
});

// Check 2: YAML syntax validation
console.log('\n2. 📝 YAML Workflow Syntax Check');
console.log('-'.repeat(40));

const workflowDir = '.github/workflows';
const workflowFiles = fs.readdirSync(workflowDir).filter(f => f.endsWith('.yml'));

workflowFiles.forEach(file => {
  try {
    execSync(`yamllint ${path.join(workflowDir, file)}`, { stdio: 'pipe' });
    console.log(`   ✅ ${file}: Valid YAML`);
  } catch (error) {
    console.log(`   ❌ ${file}: YAML syntax errors`);
    console.log(`      ${error.stdout.toString().trim()}`);
  }
});

// Check 3: File existence check
console.log('\n3. 📁 Required Files Check');
console.log('-'.repeat(40));

const requiredFiles = [
  'worker/wrangler.toml',
  'worker/package.json', 
  'worker/src/index.js',
  'ui/package.json',
  'scripts/verify_authentication_integration.mjs'
];

requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`   ✅ ${file}: Exists`);
  } else {
    console.log(`   ❌ ${file}: Missing`);
  }
});

// Check 4: Local wrangler authentication
console.log('\n4. 🔐 Local Wrangler Authentication Check');
console.log('-'.repeat(40));

try {
  const whoami = execSync('cd worker && npx wrangler whoami', { encoding: 'utf-8' });
  if (whoami.includes('You are logged in')) {
    console.log('   ✅ Local wrangler authentication: Working');
    
    // Extract account info
    const accountMatch = whoami.match(/Account ID\s*│\s*([a-f0-9]+)/);
    if (accountMatch) {
      console.log(`   📋 Account ID: ${accountMatch[1]}`);
    }
  } else {
    console.log('   ❌ Local wrangler authentication: Failed');
  }
} catch (error) {
  console.log('   ❌ Local wrangler authentication: Error');
  console.log(`      ${error.message}`);
}

// Check 5: Worker dry-run test
console.log('\n5. 🧪 Worker Deployment Dry Run');
console.log('-'.repeat(40));

try {
  execSync('cd worker && npx wrangler deploy --dry-run --env production', { stdio: 'pipe' });
  console.log('   ✅ Worker dry-run: Passed');
} catch (error) {
  console.log('   ❌ Worker dry-run: Failed');
  console.log(`      ${error.stdout?.toString().trim() || error.message}`);
}

// Check 6: Pages deployment test
console.log('\n6. 🎨 Pages Build Test');
console.log('-'.repeat(40));

try {
  if (fs.existsSync('ui/functions')) {
    execSync('cd ui && npx wrangler pages functions build functions --outdir .wrangler/functions-build', { stdio: 'pipe' });
    console.log('   ✅ Pages Functions build: Passed');
  } else {
    console.log('   ℹ️ Pages Functions: No functions directory found (OK)');
  }
} catch (error) {
  console.log('   ❌ Pages Functions build: Failed');
  console.log(`      ${error.stdout?.toString().trim() || error.message}`);
}

// Summary and recommendations
console.log('\n🎯 Summary and Recommendations');
console.log('=' .repeat(60));

console.log('\n📋 To fix GitHub Actions deployment failures:');
console.log('');
console.log('1. 🔑 Configure Repository Secrets:');
console.log('   • Go to: https://github.com/anchorskov/grassrootsmvt/settings/secrets/actions');
console.log('   • Add CLOUDFLARE_API_TOKEN with your Cloudflare API token');
console.log('   • Add CLOUDFLARE_ACCOUNT_ID with your account ID');
console.log('');
console.log('2. 🔧 Fix YAML Syntax Issues:');
console.log('   • Run: yamllint .github/workflows/*.yml');
console.log('   • Fix any reported syntax errors');
console.log('');
console.log('3. 🚀 Re-run Failed Workflows:');
console.log('   • Go to: https://github.com/anchorskov/grassrootsmvt/actions');
console.log('   • Click "Re-run all jobs" on failed workflow runs');
console.log('');
console.log('4. 📊 Monitor Deployment:');
console.log('   • Check workflow logs for specific error messages');
console.log('   • Verify deployments at https://grassrootsmvt.org');
console.log('');

console.log('🔗 Useful Links:');
console.log('   • GitHub Actions: https://github.com/anchorskov/grassrootsmvt/actions');
console.log('   • Cloudflare Dashboard: https://dash.cloudflare.com');
console.log('   • Repository Settings: https://github.com/anchorskov/grassrootsmvt/settings');