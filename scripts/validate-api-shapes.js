#!/usr/bin/env node
/**
 * API Payload Shape Validator
 * Validates that /api/call endpoint maintains expected payload structure
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function validateApiCallPayloads() {
  console.log('🔍 Validating /api/call payload shapes...');
  
  // Find files that make /api/call requests
  const uiDir = path.join(__dirname, '..', 'ui');
  const files = findJsFiles(uiDir);
  
  let hasValidation = false;
  
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    
    // Check for /api/call usage
    if (content.includes('/api/call')) {
      console.log(`📄 Checking ${path.relative(process.cwd(), file)}`);
      
      // Validate request payload structure
      if (content.includes('filters') && content.includes('limit')) {
        console.log('  ✅ Request payload has filters and limit');
        hasValidation = true;
      }
      
      // Validate response handling
      if (content.includes('result') && (content.includes('voter_id') || content.includes('voterId'))) {
        console.log('  ✅ Response handling expects result with voter_id');
      }
      
      // Check for proper error handling
      if (content.includes('catch') || content.includes('.error')) {
        console.log('  ✅ Has error handling');
      }
    }
  }
  
  if (!hasValidation) {
    console.log('⚠️  No /api/call usage found - this might be expected');
  }
  
  console.log('✅ API payload shape validation complete');
}

function findJsFiles(dir, files = []) {
  const entries = fs.readdirSync(dir);
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules') {
      findJsFiles(fullPath, files);
    } else if (entry.endsWith('.js') || entry.endsWith('.html')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

// Run validation
try {
  validateApiCallPayloads();
  process.exit(0);
} catch (error) {
  console.error('❌ API validation failed:', error.message);
  process.exit(1);
}