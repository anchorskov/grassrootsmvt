#!/usr/bin/env node
/*
Checks Cloudflare Worker routes for overlaps with Pages project domains.
Usage:
  CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... node scripts/check_cf_routes_conflicts.mjs [--json] [--markdown]
*/

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

if (!ACCOUNT_ID || !API_TOKEN) {
  console.error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN environment variables');
  process.exit(2);
}

const BASE = 'https://api.cloudflare.com/client/v4/accounts/' + ACCOUNT_ID;
const HEADERS = { Authorization: `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' };

const args = process.argv.slice(2);
const FLAG_JSON = args.includes('--json');
const FLAG_MD = args.includes('--markdown');

import fs from 'fs/promises';

async function fetchJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

async function fetchAllPages(urlBase, perPage = 50) {
  let page = 1;
  const all = [];
  while (true) {
    const u = new URL(urlBase);
    u.searchParams.set('per_page', String(perPage));
    u.searchParams.set('page', String(page));
    const body = await fetchJson(u.toString());
    if (!body.result) break;
    all.push(...body.result);
    const info = body.result_info || {};
    if (!info.page || !info.total_pages) break;
    if (info.page >= info.total_pages) break;
    page++;
  }
  return all;
}

function hostPatternToRegex(hostPattern) {
  // escape dots, replace * with [^.]+ or .* depending placement
  // simple approach: replace * with .* and anchor
  const esc = hostPattern.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&');
  const regex = '^' + esc.replace(/\\\*/g, '.*') + '$';
  return new RegExp(regex, 'i');
}

function parseRoutePattern(route) {
  // route.pattern or route.route is sometimes used; accept route as string
  const pattern = route.pattern || route.route || route;
  // split host and path
  const [hostPart, ...rest] = pattern.split('/');
  const host = hostPart || '';
  const path = '/' + rest.join('/');
  return { pattern, host, path };
}

function hostMatches(routeHost, pagesDomain) {
  if (!routeHost || !pagesDomain) return false;
  if (routeHost === pagesDomain) return true;
  // wildcard in routeHost
  if (routeHost.includes('*')) {
    const rx = hostPatternToRegex(routeHost);
    return rx.test(pagesDomain);
  }
  return false;
}

async function getWorkerRoutes() {
  // Try account-level routes first (available for some accounts)
  const urlBase = `${BASE}/workers/routes`;
  try {
    return await fetchAllPages(urlBase, 100);
  } catch (e) {
    // bubble up the error so caller can decide to fallback
    const msg = e && e.message ? e.message : String(e);
    throw new Error('Account-level routes error: ' + msg);
  }
}

async function getZones() {
  const urlBase = `https://api.cloudflare.com/client/v4/zones?account.id=${ACCOUNT_ID}`;
  try {
    return await fetchAllPages(urlBase, 50);
  } catch (e) {
    throw new Error('Failed to list zones: ' + e.message);
  }
}

async function getZoneRoutes(zoneId) {
  const urlBase = `https://api.cloudflare.com/client/v4/zones/${zoneId}/workers/routes`;
  try {
    return await fetchAllPages(urlBase, 100);
  } catch (e) {
    // return empty on error for that zone
    return [];
  }
}

async function getPagesProjects() {
  const urlBase = `${BASE}/pages/projects`;
  try {
    // Some Pages endpoints reject list options when provided; do an initial fetch without pagination
    const first = await fetchJson(urlBase);
    const results = Array.isArray(first.result) ? [...first.result] : [];
    const info = first.result_info || null;
    if (!info || !info.total_pages || info.total_pages <= 1) return results;

    // paginate explicitly using URL constructor
    for (let page = 2; page <= info.total_pages; page++) {
      const u = new URL(urlBase);
      u.searchParams.set('page', String(page));
      const body = await fetchJson(u.toString());
      if (Array.isArray(body.result)) results.push(...body.result);
    }
    return results;
  } catch (e) {
    throw new Error('Failed to fetch pages projects: ' + e.message);
  }
}

async function getProjectDomains(projectName) {
  const urlBase = `${BASE}/pages/projects/${encodeURIComponent(projectName)}/domains`;
  try {
    return await fetchAllPages(urlBase, 50);
  } catch (e) {
    // if project has no domains or API returns 404, return empty
    return [];
  }
}

function writeMarkdown(reportLines) {
  const md = ['# Cloudflare Routes vs Pages Projects', '', ...reportLines].join('\n');
  const out = 'cloudflare-routes-report.md';
  return fs.writeFile(out, md).then(() => console.log('Wrote', out));
}

function awaitWriteFile(file, data) {
  return fs.writeFile(file, data);
}

(async function main() {
  try {
    console.log('Fetching Worker routes (account-level)...');
    let routes = [];
    try {
      routes = await getWorkerRoutes();
      console.log('Found', routes.length, 'account-level worker routes');
    } catch (acctErr) {
      console.warn('Account-level worker routes failed:', acctErr.message);
      console.log('Falling back to zone-level worker routes...');
      const zones = await getZones();
      console.log('Found', zones.length, 'zones; enumerating routes per zone');
      for (const z of zones) {
        const zr = await getZoneRoutes(z.id);
        // annotate zone id in route objects
        for (const r of zr) r._zone = z.id;
        routes.push(...zr);
      }
      console.log('Collected', routes.length, 'zone-level worker routes');
    }

    console.log('Fetching Pages projects...');
    const projects = await getPagesProjects();
    console.log('Found', projects.length, 'Pages projects');

    // collect domains for all projects
    const projectDomains = [];
    for (const p of projects) {
      const name = p.name || p.id || p.project_name || p;
      const domains = await getProjectDomains(name);
      for (const d of domains) {
        // domain object may have 'domain' field
        const domainName = d.domain || d.name || d.host;
        if (domainName) projectDomains.push({ project: name, domain: domainName, info: d });
      }
    }

    console.log('Collected', projectDomains.length, 'project domains');

    // analyze overlaps
    const report = [];

    for (const r of routes) {
      const routePattern = r.pattern || r.route || r;
      const { host, path } = parseRoutePattern(r);
      const workerName = r.script || r.enabled || (r && r.zone_id) || '';

      const conflicts = projectDomains.filter(pd => hostMatches(host, pd.domain));
      const status = conflicts.length ? 'CONFLICT' : 'OK';
      report.push({ route: routePattern, worker: workerName, conflicts: conflicts.map(c => `${c.domain} (project=${c.project})`), status });
    }

    if (FLAG_JSON) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    // Prepare table
    const tableLines = [];
    tableLines.push('| Route Pattern | Worker Name | Conflicts With Pages Project | Status |');
    tableLines.push('| --- | --- | --- | --- |');
    for (const r of report) {
      tableLines.push(`| ${r.route} | ${r.worker || '-'} | ${r.conflicts.length ? r.conflicts.join(', ') : '-'} | ${r.status} |`);
    }

    const mdLines = ['## Route conflict report', '', ...tableLines, ''];

    if (FLAG_MD) {
      awaitWriteFile('cloudflare-routes-report.md', mdLines.join('\n'));
      console.log('Wrote cloudflare-routes-report.md');
      return;
    }

    // Print console table
    console.log('\n' + tableLines.join('\n'));

    // write markdown file
    awaitWriteFile('cloudflare-routes-report.md', ['# Cloudflare Routes Report', '', ...mdLines].join('\n'));
    console.log('\nWrote cloudflare-routes-report.md');

    const conflicts = report.filter(r => r.status === 'CONFLICT');
    if (!conflicts.length) {
      console.log('\n✅ No overlapping routes detected.');
    } else {
      console.log('\n⚠️ Found route conflicts — consider removing these Workers routes.');
      for (const c of conflicts) console.log(' -', c.route, 'conflicts with', c.conflicts.join(', '));
    }
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exit(1);
  }
})();
