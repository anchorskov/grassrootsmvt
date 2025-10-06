import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

function startWrangler() {
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
  startWrangler();
  return Promise.race([
    startPromise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout waiting for wrangler to start')), timeoutMs))
  ]);
}

function findApiFiles(dir) {
  const files = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const it of items) {
    const full = path.join(dir, it.name);
    if (it.isDirectory()) {
      files.push(...findApiFiles(full));
    } else if (it.isFile() && it.name.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

async function probeEndpoint(urlPath) {
  const results = { endpoint: urlPath, triedMethod: null, status: null, origin: null, ok: false, diagnostic: null };
  for (const method of PROBE_METHODS) {
    results.triedMethod = method;
    try {
      const res = await httpRequest(method, `http://127.0.0.1:${PORT}${urlPath}`, { Origin: ORIGIN });
      results.status = res.statusCode;
      results.origin = res.headers['access-control-allow-origin'] || null;
      if (res.statusCode === 200) {
        results.ok = true;
        break;
      }
      // if non-200, keep last response for diagnostic if all methods fail
      results.diagnostic = { headers: res.headers, bodyPreview: (res.body || '').toString().slice(0, 200) };
    } catch (err) {
      results.diagnostic = { error: String(err) };
    }
  }
  return results;
}

function httpRequest(method, urlStr, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(urlStr);
    const opts = {
      method,
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      headers,
    };
    const lib = urlObj.protocol === 'https:' ? awaitImport('https') : awaitImport('http');
    lib.then(({ http, https }) => {
      const httpLib = urlObj.protocol === 'https:' ? https : http;
      const req = httpLib.request(opts, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          res.body = Buffer.concat(chunks);
          resolve(res);
        });
      });
      req.on('error', (e) => reject(e));
      if (method === 'POST') req.write('{}');
      req.end();
    }).catch(reject);
  });
}

// helper to import http/https when needed
function awaitImport(name) {
  return new Promise((res, rej) => {
    try {
      if (name === 'https' || name === 'http') {
        // dynamic import to satisfy ESM top-level
        import(name).then((m) => res({ [name]: m.default || m })).catch(rej);
      } else {
        import(name).then(res).catch(rej);
      }
    } catch (e) { rej(e); }
  });
}

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

  const files = findApiFiles(API_DIR);
  console.log('Discovered', files.length, 'API files');

  const endpoints = files.map((f) => {
    const rel = path.relative(path.join(ROOT, 'ui', 'functions', 'api'), f);
    const urlPath = '/' + rel.replace(/\\\\/g, '/').replace(/\.js$/, '');
    return { file: f, path: urlPath };
  });

  const results = [];
  for (const ep of endpoints) {
    console.log(`Testing ${ep.path}...`);
    const r = await probeEndpoint(ep.path);
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

// run
main().catch((err) => {
  console.error('Unexpected error:', err);
  cleanupAndExit(1);
});
