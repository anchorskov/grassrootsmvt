import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const UI_DIR = path.join(ROOT, 'ui');
const API_DIR = path.join(ROOT, 'ui', 'functions', 'api');
const PORT = 8788;
const WRANGLER = 'npx';
const WRANGLER_ARGS = ['wrangler@4.42.0', 'pages', 'dev', UI_DIR, '--port=' + PORT];
const START_TIMEOUT_MS = 60_000; // 60s
const PROBE_METHODS = ['GET', 'OPTIONS', 'POST'];
const ORIGIN = `http://localhost:${PORT}`;
const OUT_MD = path.join(ROOT, 'api-verification.md');

let wranglerProc = null;
let started = false;

// If SKIP_WRANGLER env var is set, skip starting wrangler
const SKIP_WRANGLER = process.env.SKIP_WRANGLER === 'true';

function startWrangler() {
  if (SKIP_WRANGLER) {
    console.log('Skipping wrangler dev server (SKIP_WRANGLER=true)');
    started = true;
    return;
  }
  console.log('Starting wrangler pages dev...');
  wranglerProc = spawn(WRANGLER, WRANGLER_ARGS, { stdio: ['ignore', 'pipe', 'pipe'] });

  wranglerProc.stdout.setEncoding('utf8');
  wranglerProc.stderr.setEncoding('utf8');

  const onStdout = (chunk) => {
    process.stdout.write(chunk);
    if (!started && chunk.includes('Ready on http://localhost')) {
      started = true;
      wranglerProc.stdout.removeListener('data', onStdout);
      wranglerProc.stderr.removeListener('data', onStderr);
      console.log('Detected wrangler ready.');
      resolveStart();
    }
  };
  const onStderr = (chunk) => {
    process.stderr.write(chunk);
    if (!started && chunk.includes('Ready on http://localhost')) {
      started = true;
      wranglerProc.stdout.removeListener('data', onStdout);
      wranglerProc.stderr.removeListener('data', onStderr);
      console.log('Detected wrangler ready (stderr).');
      resolveStart();
    }
  };

  wranglerProc.stdout.on('data', onStdout);
  wranglerProc.stderr.on('data', onStderr);

  wranglerProc.on('exit', (code, signal) => {
    if (!started) {
      rejectStart(new Error(`wrangler exited early: ${code} ${signal}`));
    }
  });
}

let resolveStart, rejectStart;
const startPromise = new Promise((res, rej) => { resolveStart = res; rejectStart = rej; });

function waitForStart(timeoutMs = START_TIMEOUT_MS) {
  if (SKIP_WRANGLER) return;
  startWrangler();
  return Promise.race([
    startPromise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout waiting for wrangler to start')), timeoutMs))
  ]);
}

// PATCH: Directly define worker route endpoints for testing
const WORKER_ENDPOINTS = [
  { method: 'GET', path: '/whoami' },
  { method: 'POST', path: '/canvass' },
  { method: 'POST', path: '/canvass/nearby' },
  { method: 'POST', path: '/contact' },
  { method: 'POST', path: '/contact-staging' },
  { method: 'POST', path: '/pulse' },
  { method: 'GET', path: '/contact/status' },
];

async function main() {
  process.on('SIGINT', cleanupAndExit);
  process.on('SIGTERM', cleanupAndExit);

  try {
    await waitForStart();
  } catch (err) {
    console.error('Failed to start wrangler:', err.message || err);
    cleanupAndExit(1);
    return;
  }

  // Use WORKER_ENDPOINTS instead of UI API files
  const endpoints = WORKER_ENDPOINTS;
  const results = [];
  for (const ep of endpoints) {
    console.log(`Testing ${ep.method} ${ep.path}...`);
    const r = await probeEndpoint(ep.path, ep.method);
    if (r.ok) console.log(`OK ${ep.path} (${r.status})`);
    else console.log(`FAIL ${ep.path} (last status ${r.status})`);
    results.push(r);
  }

  // write markdown
  const lines = [];
  lines.push('# API Verification Results');
  lines.push('');
  lines.push('| Endpoint | Tried Method | Status | Access-Control-Allow-Origin |');
  lines.push('| --- | --- | ---: | --- |');
  for (const r of results) {
    lines.push(`| ${r.endpoint} | ${r.triedMethod || '-'} | ${r.status || '-'} | ${r.origin || '-'} |`);
  }

  const failed = results.filter(r => !r.ok);
  if (failed.length > 0) {
    lines.push('\n## Diagnostics\n');
    for (const r of failed) {
      lines.push(`### ${r.endpoint}`);
      if (r.diagnostic?.error) {
        lines.push('Error: `' + String(r.diagnostic.error) + '`');
      } else {
        lines.push('- Headers:');
        for (const [k, v] of Object.entries(r.diagnostic?.headers || {})) {
          lines.push(`  - ${k}: ${v}`);
        }
        lines.push('\n- Body preview:');
        lines.push('```');
        lines.push(r.diagnostic?.bodyPreview || '');
        lines.push('```');
      }
      lines.push('');
    }
  }

  fs.writeFileSync(OUT_MD, lines.join('\n'));

  // summary to console
  const total = results.length;
  const okCount = results.filter(r => r.ok).length;
  const missingCors = results.filter(r => !r.origin).length;
  console.log('\nSummary:');
  console.log('Total endpoints tested:', total);
  console.log('Endpoints returning 200:', okCount);
  console.log('Endpoints missing CORS header:', missingCors);

  cleanupAndExit(0);
}

function cleanupAndExit(codeOrEvent = 0) {
  const code = typeof codeOrEvent === 'number' ? codeOrEvent : 0;
  if (wranglerProc) {
    try { wranglerProc.kill(); } catch (e) { /* ignore */ }
  }
  process.exit(code);
}

// Treat 400 as WARN (expected on missing params), 401 as WARN (unauth), 500 as FAIL
const warnCodes = new Set([400, 401]);
function grade(code) {
  if (code >= 200 && code < 300) return 'PASS';
  if (warnCodes.has(code)) return 'WARN';
  return 'FAIL';
}

// Minimal probeEndpoint for worker route testing
async function probeEndpoint(path, method = 'GET') {
  const url = `http://localhost:8788${path}`;
  const opts = { method, headers: { 'Origin': 'http://localhost:8788', 'Content-Type': 'application/json' } };
  let res, body = '', status = 0, origin = '', headers = {};
  try {
    await new Promise((resolve, reject) => {
      const req = http.request(url, opts, (response) => {
        status = response.statusCode;
        headers = response.headers;
        origin = response.headers['access-control-allow-origin'] || '';
        response.setEncoding('utf8');
        response.on('data', chunk => { body += chunk; });
        response.on('end', resolve);
      });
      req.on('error', reject);
      if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
        req.write('{}'); // send empty JSON body for POST/PUT/PATCH
      }
      req.end();
    });
    return {
      ok: status >= 200 && status < 300,
      status,
      endpoint: path,
      triedMethod: method,
      origin,
      diagnostic: { headers, bodyPreview: body.slice(0, 200) }
    };
  } catch (error) {
    return {
      ok: false,
      status,
      endpoint: path,
      triedMethod: method,
      origin,
      diagnostic: { error: String(error), headers, bodyPreview: body.slice(0, 200) }
    };
  }
}

// run
main().catch((err) => {
  console.error('Unexpected error:', err);
  cleanupAndExit(1);
});
