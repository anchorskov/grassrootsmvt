// scripts/dev-sqlite-api.mjs
// Dev-only SQLite sidecar that mirrors the Worker’s endpoints.
// Start with: PORT=8787 node scripts/dev-sqlite-api.mjs
import express from "express";
import cors from "cors";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.env.PORT || 8787);
const SQLITE_PATH = process.env.SQLITE_PATH || "/home/anchor/projects/voterdata/wyoming/wy.sqlite";
const META_OUT = process.env.META_OUT || "ui/admin/wy.json";
const DEV_EMAIL = process.env.DEV_EMAIL || "dev@local";

// Read-only DB handle for safe concurrent reads in dev
const db = new Database(SQLITE_PATH, { readonly: true });

// Write connection (separate handle; enables WAL-friendly concurrent reads)
// NOTE: No { readonly:true } here.
const dbWrite = new Database(SQLITE_PATH);
// Small safety: turn on WAL for better concurrency in dev
dbWrite.pragma('journal_mode = WAL');

// Tiny helpers for writes
const exec = (sql, ...args) => dbWrite.prepare(sql).run(...args);

// Dev-only local activity table (safe no-op if it already exists)
exec(`
  CREATE TABLE IF NOT EXISTS call_activity (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ts              DATETIME DEFAULT CURRENT_TIMESTAMP,
    voter_id        TEXT,
    outcome         TEXT,
    payload_json    TEXT,
    volunteer_email TEXT
  );
`);

// helpers
const q  = (sql, ...args) => db.prepare(sql).all(...args);
const q1 = (sql, ...args) => db.prepare(sql).get(...args);
const uniq = (arr) => Array.from(new Set(arr)).filter(Boolean);
// helper: Upper-case safe normalizer
const up = (s) => (s ?? "").toString().trim().toUpperCase();

// ---- add helpers ----
const PARTY_MAP = {
  R:'Republican', D:'Democratic', U:'Unaffiliated',
  REPUBLICAN:'Republican', DEMOCRATIC:'Democratic', UNAFFILIATED:'Unaffiliated'
};
const PARTY_CANON = new Set(Object.values(PARTY_MAP));

function normalizeParties(arr) {
  const out = [];
  for (const raw of (arr || [])) {
    const key = String(raw || '').toUpperCase();
    const mapped = PARTY_MAP[key] || raw;
    if (PARTY_CANON.has(mapped)) out.push(mapped);
  }
  return out;
}

// Normalize street suffixes to short canonical form (e.g. STREET -> ST, AVENUE -> AVE)
function canonicalizeStreet(s) {
  if (!s) return s;
  let t = String(s).toUpperCase().trim();
  // Normalize directional words/prefixes (NORTH -> N, SOUTH -> S, EAST -> E, WEST -> W)
  t = t.replace(/^NORTH\s+/,'N ').replace(/^SOUTH\s+/,'S ').replace(/^EAST\s+/,'E ').replace(/^WEST\s+/,'W ');
  t = t.replace(/\s+NORTH$/,' N').replace(/\s+SOUTH$/,' S').replace(/\s+EAST$/,' E').replace(/\s+WEST$/,' W');
  // Normalize common abbreviations and suffixes
  const map = [
    [' STREET', ' ST'], [' ST.', ' ST'],
    [' AVENUE', ' AVE'], [' AVE.', ' AVE'],
    [' ROAD', ' RD'], [' RD.', ' RD'],
    [' BOULEVARD', ' BLVD'], [' BLVD.', ' BLVD'],
    [' DRIVE', ' DR'], [' DR.', ' DR'],
    [' LANE', ' LN'], [' LN.', ' LN'],
    [' COURT', ' CT'], [' CT.', ' CT'],
    [' PLACE', ' PL'], [' PL.', ' PL']
  ];
  // replace suffixes
  for (const [k, v] of map) {
    t = t.replace(new RegExp(k + '$'), v);
  }
  // replace interior occurrences and variants
  for (const [k, v] of map) {
    t = t.split(k).join(v);
  }
  // collapse multiple spaces
  t = t.replace(/\s+/g, ' ').trim();
  // If directional appears immediately before the suffix (e.g. 'MAIN N ST' or 'MAIN NORTH ST'),
  // move it to prefix so 'MAIN N ST' -> 'N MAIN ST' for consistent matching
  try {
    const toks = t.split(' ');
    const sufSet = new Set(['ST','AVE','RD','BLVD','DR','LN','CT','PL']);
    if (toks.length >= 3) {
      const last = toks[toks.length-1];
      const pen = toks[toks.length-2];
      const dirSet = new Set(['N','S','E','W','NORTH','SOUTH','EAST','WEST']);
      if (sufSet.has(last) && dirSet.has(pen)) {
        // remove pen and bring to front
        toks.splice(toks.length-2, 1);
        toks.unshift(pen);
        t = toks.join(' ');
      }
    }
  } catch (e) { /* ignore */ }
  // Normalize directional long-forms to single-letter abbreviations
  t = t.replace(/\bNORTH\b/g, 'N').replace(/\bSOUTH\b/g, 'S').replace(/\bEAST\b/g, 'E').replace(/\bWEST\b/g, 'W');
  // also collapse any double spaces introduced
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

// Canonicalize a street string to improve matching (cheap, no USPS needed)
function normalizeStreetInput(s) {
  const SUFFIX = {
    STREET: 'ST', ST: 'ST',
    AVENUE: 'AVE', AVE: 'AVE',
    ROAD: 'RD', RD: 'RD',
    DRIVE: 'DR', DR: 'DR',
    LANE: 'LN', LN: 'LN',
    COURT: 'CT', CT: 'CT',
    PLACE: 'PL', PL: 'PL',
    BOULEVARD: 'BLVD', BLVD: 'BLVD',
    PARKWAY: 'PKWY', PKWY: 'PKWY',
    TERRACE: 'TER', TER: 'TER',
    HIGHWAY: 'HWY', HWY: 'HWY',
    CIRCLE: 'CIR', CIR: 'CIR',
    WAY: 'WAY'
  };
  const DIR = { NORTH:'N', N:'N', SOUTH:'S', S:'S', EAST:'E', E:'E', WEST:'W', W:'W' };
  const UNIT = new Set(['APT','APARTMENT','UNIT','STE','SUITE','#']);

  // Uppercase, collapse spaces, drop commas/periods
  let t = (s || '').toUpperCase().replace(/[.,]/g,' ').replace(/\s+/g,' ').trim();
  if (!t) return { base: '', abbr: '', full: '' };

  // Remove unit designators and the token that follows them ("APT 1", "# 5", "UNIT B")
  const toks = t.split(' ');
  const cleaned = [];
  let skipNext = false;
  for (let i = 0; i < toks.length; i++) {
    const tok = toks[i];
    if (skipNext) { skipNext = false; continue; }
    if (tok === '#') { skipNext = true; continue; }
    if (UNIT.has(tok)) { skipNext = true; continue; }
    cleaned.push(tok);
  }
  t = cleaned.join(' ');

  // Split tokens; drop leading house number if present
  let parts = t.split(' ');
  if (/^\d+[A-Z]?$/.test(parts[0])) parts = parts.slice(1);
  if (!parts.length) return { base: '', abbr: '', full: '' };

  // Optional leading directional
  if (parts.length > 1 && DIR[parts[0]]) parts = parts.slice(1);

  // Optional trailing directional (e.g., "MAIN ST W")
  if (parts.length > 1 && DIR[parts[parts.length-1]]) parts = parts.slice(0,-1);

  // Last token might be suffix
  let suffix = parts[parts.length-1];
  const mapped = SUFFIX[suffix] || suffix;
  if (mapped !== suffix) parts = parts.slice(0,-1).concat(mapped);

  const full = parts.join(' ');                 // e.g., "BELLAIRE DR"
  const abbr = parts.join(' ');                 // already abbreviated
  const base = parts.slice(0,-1).join(' ') || full; // base without suffix if present

  // Also produce an "expanded" form if the user typed the abbreviation
  let expanded = full;
  for (const [k,v] of Object.entries(SUFFIX)) {
    if (v === parts[parts.length-1] && k.length > v.length) { // one expanded key
      expanded = parts.slice(0,-1).concat(k).join(' ');
      break;
    }
  }
  return { base, abbr: full, full: expanded };
}

// Register SQL function for canonical street normalization for use inside queries
try {
  // better-sqlite3 exposes .function on the Database instance
  if (typeof db.function === 'function') {
    db.function('canon_street', { deterministic: true }, (s) => canonicalizeStreet(s));
  }
} catch (e) {
  console.warn('Unable to register SQL function canon_street:', e && e.message);
}

function normalizeFiltersShape(f = {}) {
  const norm = { ...f };
  if (norm.county) norm.county = String(norm.county).trim().toUpperCase();
  if (norm.city)   norm.city   = String(norm.city).trim().toUpperCase();
  if (norm.district_type) norm.district_type = String(norm.district_type).toLowerCase(); // house|senate
  if (norm.district) {
    const d = String(norm.district).trim();
    norm.district = /^\d+$/.test(d) ? d.padStart(2, '0') : d;
  }
  norm.parties = normalizeParties(Array.isArray(f.parties) ? f.parties : (f.parties ? [f.parties] : []));
  norm.limit = Math.max(1, Math.min(200, Number(f.limit || 50)));
  return norm;
}

const app = express();
app.use(cors());
app.use(express.json());

// helper: Title Case “NATRONA” -> “Natrona”, “BAR NUNN” -> “Bar Nunn”
const titleCase = (s) =>
  (s || "")
    .toLowerCase()
    .split(/\s+/)
    .map(w => w ? w[0].toUpperCase() + w.slice(1) : w)
    .join(" ")
    .replace(/\bIi\b/g, "II") // small niceties
    .replace(/\bIii\b/g, "III");

// --- META builder for /admin/meta/refresh ---
function cols(rows, col) { return uniq(rows.map(r => (r[col] ?? "").toString().trim())).sort(); }

function buildMeta() {
  const counties = cols(q(`SELECT DISTINCT county FROM voters WHERE county IS NOT NULL AND TRIM(county)<>''`), "county");

  const cities_by_county = {};
  for (const county of counties) {
    const rows = q(`
      SELECT DISTINCT n.city
      FROM v_voters_addr_norm n
      JOIN voters v ON v.voter_id = n.voter_id
      WHERE v.county = ? AND n.city IS NOT NULL AND TRIM(n.city) <> ''
    `, county);
    cities_by_county[county] = cols(rows, "city");
  }

  const house_by_county = {};
  const senate_by_county = {};
  for (const county of counties) {
    house_by_county[county]  = cols(q(`SELECT DISTINCT house_district  AS d FROM voters WHERE county = ? AND TRIM(house_district)  <> ''`, county), "d");
    senate_by_county[county] = cols(q(`SELECT DISTINCT senate_district AS d FROM voters WHERE county = ? AND TRIM(senate_district) <> ''`, county), "d");
  }

  return {
    version: 1,
    generated_at: new Date().toISOString(),
    state: "WY",
    counties,
    cities_by_county,
    districts_by_county: { house: house_by_county, senate: senate_by_county },
  };
}

// --- Basic info ---
app.get("/api/ping", (req, res) => {
  res.json({
    ok: true,
    method: "GET",
    data_backend: "sqlite-dev",
    sqlite_path: SQLITE_PATH,
    local_sqlite_api: `http://127.0.0.1:${PORT}`,
    query: req.query || {}
  });
});

app.get("/api/whoami", (req, res) => res.json({ ok: true, email: DEV_EMAIL }));

// --- Canvass list: GET & POST ---
function parseFilters(req) {
  let f = {};
  if (req.method === "GET")   f = req.query || {};
  if (req.method === "POST")  f = (req.body?.filters) || req.body || {};

  // Normalize shape for canonical fields (county/city/district/parties/limit)
  const nf = normalizeFiltersShape(f);

  const filters = {
    county: nf.county || null,
    city: nf.city || null,
    district_type: nf.district_type || null,
    district: nf.district || null,
    parties: Array.isArray(nf.parties) ? nf.parties.filter(Boolean) : (nf.parties ? [nf.parties] : []),
    q: f.q ? String(f.q).trim().toUpperCase() : null,
    limit: Math.max(1, Math.min(200, Number(nf.limit || 50))),
    // NEW: phone gating knobs (for call flow)
    require_phone: f.require_phone !== undefined ? !!f.require_phone : true,
    min_confidence: f.min_confidence !== undefined ? Number(f.min_confidence) : 1, // 1+ by default
    wy_area_only: f.wy_area_only !== undefined ? !!f.wy_area_only : false,
  };
  return filters;
}


// ---- Sidecar: preview endpoint (handy for debugging) ----
app.all('/api/filters/normalize', (req, res) => {
  const raw = req.method === 'GET' ? (req.query || {}) : ((req.body?.filters) || req.body || {});
  res.json({ ok:true, normalized: normalizeFiltersShape(raw) });
});

function whereAndParams(filters, extra = {}) {
  const cond = [];
  const p = [];

  if (filters.county) { cond.push(`v.county = ?`); p.push(filters.county); }
  if (filters.city)   { cond.push(`n.city = ?`);   p.push(filters.city); }

  if (filters.district_type && filters.district) {
    if (filters.district_type === "house")  { cond.push(`v.house_district  = ?`); p.push(filters.district); }
    if (filters.district_type === "senate") { cond.push(`v.senate_district = ?`); p.push(filters.district); }
  }

  if (filters.parties?.length) {
    const placeholders = filters.parties.map(()=>"?").join(",");
    cond.push(`v.political_party IN (${placeholders})`);
    p.push(...filters.parties);
  }

  if (filters.q) {
    cond.push(`( UPPER(n.addr1) LIKE ? OR UPPER(n.city) LIKE ? OR UPPER(n.fn || ' ' || n.ln) LIKE ? )`);
    const like = `%${(filters.q||'').toString().toUpperCase()}%`;
    p.push(like, like, like);
  }

  // Support an array of exclude_ids to avoid recently-seen voters
  const excludes = (extra.exclude_ids || []).filter(Boolean);
  if (excludes.length) {
    cond.push(`v.voter_id NOT IN (${excludes.map(()=>'?').join(',')})`);
    p.push(...excludes);
  }

  return { cond, p };
}

function getExcludeId(req) {
  if (req.method === "GET") return req.query?.exclude_id || null;
  if (req.method === "POST") return (req.body?.exclude_id) || null;
  return null;
}

function getExcludeIds(req) {
  if (req.method === "GET") {
    const raw = req.query?.exclude_ids;
    return Array.isArray(raw) ? raw : (raw ? [raw] : []);
  }
  if (req.method === "POST") {
    const raw = req.body?.exclude_ids;
    return Array.isArray(raw) ? raw : (raw ? [raw] : []);
  }
  return [];
}

app.get("/api/canvass/list", (req, res) => {
  try {
    const filters = parseFilters(req);
    const { cond, p } = whereAndParams(filters);
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";

    const sql = `
      SELECT n.addr1 AS address,
             (n.fn || ' ' || n.ln) AS name,
             n.city, n.zip
      FROM v_voters_addr_norm n
      JOIN voters v ON v.voter_id = n.voter_id
      ${where}
      LIMIT ?
    `;
    const rows = q(sql, ...p, filters.limit);
    res.json({ ok:true, rows, filters });
  } catch (e) {
    console.error("GET /api/canvass/list error:", e);
    res.status(500).json({ ok:false, error:"canvass_list_failed" });
  }
});

app.post("/api/canvass/list", (req, res) => {
  try {
    const filters = parseFilters(req);
    const { cond, p } = whereAndParams(filters);
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";

    const sql = `
      SELECT n.addr1 AS address,
             (n.fn || ' ' || n.ln) AS name,
             n.city, n.zip
      FROM v_voters_addr_norm n
      JOIN voters v ON v.voter_id = n.voter_id
      ${where}
      LIMIT ?
    `;
    const rows = q(sql, ...p, filters.limit);
    res.json({ ok:true, rows, filters });
  } catch (e) {
    console.error("POST /api/canvass/list error:", e);
    res.status(500).json({ ok:false, error:"canvass_list_failed" });
  }
});

// --- Canvass nearby: POST { filters, street: "MAIN ST", house: 123, range?:20, limit?: 20 }
app.post("/api/canvass/nearby", (req, res) => {
  try {
    const f0 = req.body?.filters || {};
    const filters = {
      county: (f0.county || null)?.toString().trim().toUpperCase() || null,
      city:   (f0.city   || null)?.toString().trim().toUpperCase() || null,
      district_type: f0.district_type || null,  // 'house' | 'senate'
      district: f0.district || null,
      parties: Array.isArray(f0.parties) ? f0.parties.filter(Boolean) : (f0.parties ? [f0.parties] : []),
      require_phone: !!f0.require_phone,
    };

    const rawStreet = (req.body?.street || "").toString();
    const { base, abbr, full } = normalizeStreetInput(rawStreet);
    const streetIn = abbr;
    const houseIn  = Number(req.body?.house || 0);
    const range    = Math.max(0, Math.min(200, Number(req.body?.range || 20)));
    const limit    = Math.max(1, Math.min(200, Number(req.body?.limit || 20)));
    if (!streetIn || !houseIn) return res.status(400).json({ ok:false, error:"missing_house_or_street" });

    // Use normalized abbr/full patterns
    const normStreet = streetIn;

    // Build shared WHERE parts.
    const buildWhere = (includeDistrict) => {
      const cond = [];
      const p = [];

      // county & party use voters; city uses normalized view (more reliable)
      if (filters.county) { cond.push(`v.county = ?`); p.push(filters.county); }
      if (filters.city)   { cond.push(`norm.city   = ?`); p.push(filters.city); }

      // IMPORTANT: district filters from the normalized view columns (house/senate),
      // not from voters.* to avoid schema variance.
      if (includeDistrict && filters.district_type && filters.district) {
        if (filters.district_type === "house")  { cond.push(`norm.house  = ?`); p.push(filters.district); }
        if (filters.district_type === "senate") { cond.push(`norm.senate = ?`); p.push(filters.district); }
      }

      if (filters.parties?.length) {
        const placeholders = filters.parties.map(()=>"?").join(",");
        cond.push(`v.political_party IN (${placeholders})`);
        p.push(...filters.parties);
      }

      if (filters.require_phone) cond.push(`bp.phone_e164 IS NOT NULL`);

      return { cond, p };
    };

    // The core query builder for ranged search
    const runRanged = (includeDistrict) => {
      const { cond, p } = buildWhere(includeDistrict);
      const extra = cond.length ? ` AND ${cond.join(" AND ")}` : "";

      const sql = `
        WITH base AS (
          SELECT
            n.voter_id, n.fn, n.ln, n.addr1, n.city, n.zip, n.house, n.senate,
            CAST(
              CASE WHEN INSTR(UPPER(TRIM(n.addr1)),' ') > 0
                   THEN SUBSTR(UPPER(TRIM(n.addr1)), 1, INSTR(UPPER(TRIM(n.addr1)),' ')-1)
                   ELSE UPPER(TRIM(n.addr1)) END AS INTEGER
            ) AS num,
            TRIM(
              CASE WHEN INSTR(UPPER(TRIM(n.addr1)),' ') > 0
                   THEN SUBSTR(UPPER(TRIM(n.addr1)), INSTR(UPPER(TRIM(n.addr1)),' ')+1)
                   ELSE '' END
            ) AS street_raw
          FROM v_voters_addr_norm n
        ),
        norm AS (
          SELECT *,
            REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(street_raw,'  ', ' '),
              'STREET','ST'),'AVENUE','AVE'),'DRIVE','DR'),'ROAD','RD'),'LANE','LN'),'BOULEVARD','BLVD') AS street
          FROM base
        )
        SELECT
          v.voter_id,
          (norm.fn || ' ' || norm.ln) AS name,
          norm.addr1 AS address,
          norm.city, norm.zip,
          v.political_party AS party,
          bp.phone_e164 AS phone_e164,
          bp.confidence_code AS phone_confidence
        FROM norm
        JOIN voters v ON v.voter_id = norm.voter_id
        LEFT JOIN v_best_phone bp ON bp.voter_id = v.voter_id
        WHERE (norm.addr1 LIKE ? OR norm.addr1 LIKE ?)
          AND norm.num BETWEEN ? AND ?
          ${extra}
        ORDER BY ABS(norm.num - ?)
        LIMIT ?
      `;
      // build patterns to match both abbreviated and expanded forms
      const patterns = [`% ${abbr}%`, `% ${full}%`];
      const args = [patterns[0], patterns[1], houseIn - range, houseIn + range, ...p, houseIn, limit];
      return q(sql, ...args);
    };

    // Fallback query: nearest addresses on same street ordered by absolute house-number distance
    const runNearest = (includeDistrict) => {
      const { cond, p } = buildWhere(includeDistrict);
      const extra = cond.length ? ` AND ${cond.join(" AND ")}` : "";

      const sql = `
        WITH base AS (
          SELECT
            n.voter_id, n.fn, n.ln, n.addr1, n.city, n.zip, n.house, n.senate,
            CAST(
              CASE WHEN INSTR(UPPER(TRIM(n.addr1)),' ') > 0
                   THEN SUBSTR(UPPER(TRIM(n.addr1)), 1, INSTR(UPPER(TRIM(n.addr1)),' ')-1)
                   ELSE UPPER(TRIM(n.addr1)) END AS INTEGER
            ) AS num,
            TRIM(
              CASE WHEN INSTR(UPPER(TRIM(n.addr1)),' ') > 0
                   THEN SUBSTR(UPPER(TRIM(n.addr1)), INSTR(UPPER(TRIM(n.addr1)),' ')+1)
                   ELSE '' END
            ) AS street_raw
          FROM v_voters_addr_norm n
        ),
        norm AS (
          SELECT *,
            REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(street_raw,'  ', ' '),
              'STREET','ST'),'AVENUE','AVE'),'DRIVE','DR'),'ROAD','RD'),'LANE','LN'),'BOULEVARD','BLVD') AS street
          FROM base
        )
        SELECT
          v.voter_id,
          (norm.fn || ' ' || norm.ln) AS name,
          norm.addr1 AS address,
          norm.city, norm.zip,
          v.political_party AS party,
          bp.phone_e164 AS phone_e164,
          bp.confidence_code AS phone_confidence,
          ABS(norm.num - ?) AS house_distance
        FROM norm
        JOIN voters v ON v.voter_id = norm.voter_id
        LEFT JOIN v_best_phone bp ON bp.voter_id = v.voter_id
        WHERE (norm.addr1 LIKE ? OR norm.addr1 LIKE ?)
          AND norm.num IS NOT NULL
          ${extra}
        ORDER BY house_distance, norm.num
        LIMIT ?
      `;
      const patterns = [`% ${abbr}%`, `% ${full}%`];
      const args = [houseIn, patterns[0], patterns[1], ...p, limit];
      return q(sql, ...args);
    };

    // Try ranged search (with district first); if empty, drop district; if still empty and house provided,
    // run nearest-on-street fallback.
    let rows = runRanged(true);
    let broadened = false;
    if (!rows.length) { rows = runRanged(false); broadened = true; }

    let fallbackNearest = false;
    if ((!rows || rows.length === 0) && houseIn) {
      rows = runNearest(true);
      if (!rows.length) rows = runNearest(false);
      fallbackNearest = true;
    }

    res.json({
      ok: true,
      rows,
      filters,
      input: { street: normStreet, house: houseIn, range, limit },
      broadened,
      fallback_nearest: fallbackNearest
    });
  } catch (e) {
    console.error("POST /api/canvass/nearby error:", e);
    res.status(500).json({ ok:false, error:"canvass_nearby_failed" });
  }
});

// --- Call next: GET/POST (one record) ---
app.all("/api/next", (req, res) => {
  try {
    const filters = parseFilters(req);
    const exclude_ids = getExcludeIds(req);

    const baseJoin = filters.require_phone
      ? 'JOIN v_best_phone bp ON bp.voter_id = v.voter_id'
      : 'LEFT JOIN v_best_phone bp ON bp.voter_id = v.voter_id';

    const pickOne = (useExcludes) => {
      const { cond, p } = whereAndParams(filters, { exclude_ids: useExcludes ? exclude_ids : [] });
      const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
      const sql = `
        SELECT v.voter_id, n.fn AS first_name, n.ln AS last_name,
               v.political_party AS party, n.city AS ra_city, n.zip AS ra_zip,
               bp.phone_e164
        FROM voters v
        JOIN v_voters_addr_norm n ON n.voter_id = v.voter_id
        ${baseJoin}
        ${where}
        ORDER BY RANDOM()
        LIMIT 1
      `;
      return q1(sql, ...p);
    };

    let row = pickOne(true);
    if (!row) row = pickOne(false); // fallback: ignore excludes once

    if (!row) return res.json({ ok:true, filters, empty:true });
    res.json({ ok:true, ...row, filters });
  } catch (e) {
  console.error("ALL /api/next error:", e);
    res.status(500).json({ ok:false, error:"call_next_failed" });
  }
});

// --- Get single voter by id (dev helper) ---
app.get('/api/voter/:id', (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ ok:false, error:'missing_id' });
    const sql = `
      SELECT v.voter_id,
             n.fn AS first_name,
             n.ln AS last_name,
             v.political_party AS party,
             n.city AS ra_city,
             n.zip AS ra_zip,
             bp.phone_e164
      FROM voters v
      JOIN v_voters_addr_norm n ON n.voter_id = v.voter_id
      LEFT JOIN v_best_phone bp ON bp.voter_id = v.voter_id
      WHERE v.voter_id = ?
      LIMIT 1
    `;
    const row = q1(sql, id);
    if (!row) return res.status(404).json({ ok:false, error:'not_found' });
    res.json({ ok:true, ...row });
  } catch (e) {
    console.error('GET /api/voter/:id error:', e);
    res.status(500).json({ ok:false, error:'voter_lookup_failed' });
  }
});

// --- Call complete: POST (echo stub) ---
app.post("/api/complete", (req, res) => {
  try {
    const body = req.body || {};
    const email = (req.headers && (req.headers['x-volunteer-email'] || req.headers['x-user-email'])) || DEV_EMAIL || null;

    // Defensive: idempotency window (seconds)
    const IDEMPOTENT_WINDOW_SEC = Number(process.env.IDEMPOTENT_WINDOW_SEC || 30);

    // Find the most recent activity for this volunteer (if any)
    const last = db.prepare(`SELECT id, ts, voter_id FROM call_activity WHERE volunteer_email = ? ORDER BY id DESC LIMIT 1`).get(email);
    if (last && last.voter_id && body.voter_id && String(last.voter_id) === String(body.voter_id)) {
      // If within the short window, treat as duplicate and return ok without inserting
      const lastTs = new Date(last.ts).getTime ? new Date(last.ts).getTime() : Date.now();
      const ageSec = (Date.now() - lastTs) / 1000;
      if (ageSec <= IDEMPOTENT_WINDOW_SEC) {
        return res.json({ ok:true, saved: body, persisted: "sqlite", duplicate:true, note: `recent duplicate (${Math.round(ageSec)}s)` , ts: new Date().toISOString() });
      }
    }

    // Insert the activity
    exec(
      `INSERT INTO call_activity (voter_id, outcome, payload_json, volunteer_email)
       VALUES (?, ?, ?, ?)`,
      body.voter_id ?? null,
      body.outcome ?? null,
      JSON.stringify(body),
      email
    );

    // If the posted voter_id doesn't match the last served voter for this volunteer, return ok with a warning
    const warning = {};
    if (last && last.voter_id && body.voter_id && String(last.voter_id) !== String(body.voter_id)) {
      warning.mismatch_last_served = true;
      warning.last_served = last.voter_id;
    }

    res.json({ ok:true, saved: body, persisted: "sqlite", warning: Object.keys(warning).length ? warning : undefined, ts: new Date().toISOString() });
  } catch (e) {
  console.error("POST /api/complete error:", e);
    res.status(500).json({ ok:false, error:"call_complete_failed" });
  }
});

// Optional: quick recent activity reader for sanity checks
app.get("/admin/activity/recent", (req, res) => {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 10)));
    const rows = db.prepare(`
      SELECT id, ts, voter_id, outcome, volunteer_email,
             json_extract(payload_json, '$.comments') AS comments
      FROM call_activity
      ORDER BY id DESC
      LIMIT ?
    `).all(limit);
    res.json({ ok:true, rows });
  } catch (e) {
    console.error("GET /admin/activity/recent error:", e);
    res.status(500).json({ ok:false, error:"recent_failed" });
  }
});

// --- ADMIN: rebuild meta JSON from SQLite ---
app.post("/admin/meta/refresh", (req, res) => {
  try {
    // constants to tune noise filtering
    const MIN_CITY_COUNT = Number(process.env.MIN_CITY_COUNT || 3);

    // 1) Counties (authoritative list)
    const counties = db.prepare(`
      SELECT DISTINCT UPPER(TRIM(county)) AS county
      FROM voters
      WHERE county IS NOT NULL AND TRIM(county) <> ''
      ORDER BY county
    `).all().map(r => r.county);

    // 2) Cities by county:
    // Use voters INNER JOIN v_voters_addr_norm to ensure county & city come
    // from the same record. Apply a small count threshold to reduce stray pairs.
    const cityPairs = db.prepare(`
      SELECT county, city, COUNT(*) AS c
      FROM (
        SELECT
          UPPER(TRIM(v.county)) AS county,
          UPPER(TRIM(n.city))   AS city
        FROM voters v
        JOIN v_voters_addr_norm n ON n.voter_id = v.voter_id
        WHERE n.city IS NOT NULL AND TRIM(n.city) <> ''
      )
      GROUP BY county, city
      HAVING c >= ?
      ORDER BY county, city
    `).all(MIN_CITY_COUNT);

    const citiesByCounty = {};
    for (const cty of counties) citiesByCounty[cty] = [];
    for (const row of cityPairs) {
      if (!citiesByCounty[row.county]) citiesByCounty[row.county] = [];
      citiesByCounty[row.county].push(row.city);
    }

    // 3) Districts by county (zero-padded like "02")
    const senatePairs = db.prepare(`
      SELECT
        UPPER(TRIM(county)) AS county,
        printf('%02d', CAST(senate_district AS INTEGER)) AS sd
      FROM voters
      WHERE senate_district IS NOT NULL AND TRIM(senate_district) <> ''
      GROUP BY county, sd
      ORDER BY county, sd
    `).all();

    const housePairs = db.prepare(`
      SELECT
        UPPER(TRIM(county)) AS county,
        printf('%02d', CAST(house_district AS INTEGER)) AS hd
      FROM voters
      WHERE house_district IS NOT NULL AND TRIM(house_district) <> ''
      GROUP BY county, hd
      ORDER BY county, hd
    `).all();

    const senateByCounty = {};
    const houseByCounty  = {};
    for (const cty of counties) { senateByCounty[cty] = []; houseByCounty[cty] = []; }

    for (const r of senatePairs) {
      if (!senateByCounty[r.county]) senateByCounty[r.county] = [];
      senateByCounty[r.county].push(r.sd);
    }
    for (const r of housePairs) {
      if (!houseByCounty[r.county]) houseByCounty[r.county] = [];
      houseByCounty[r.county].push(r.hd);
    }

    // 4) Derive statewide unique lists (optional but handy)
    const senateAll = Array.from(new Set(senatePairs.map(r => r.sd))).sort((a,b)=>Number(a)-Number(b));
    const houseAll  = Array.from(new Set(housePairs.map(r => r.hd))).sort((a,b)=>Number(a)-Number(b));

    // 5) Compose JSON
    const payload = {
      state: "WY",
      counts: {
        counties: counties.length,
        cities: Object.values(citiesByCounty).reduce((t, arr) => t + arr.length, 0),
        senateCount: senateAll.length,
        houseCount: houseAll.length
      },
      counties,
      citiesByCounty,
      senateByCounty,
      houseByCounty,
      senateAll,
      houseAll,
      generatedAt: new Date().toISOString()
    };

  // 6) Write ui/admin/wy.json
  fs.mkdirSync("ui/admin", { recursive: true });
  fs.writeFileSync("ui/admin/wy.json", JSON.stringify(payload, null, 2));

    res.json({
      ok: true,
      wrote: "ui/admin/wy.json",
      counts: payload.counts
    });
  } catch (e) {
    console.error("refresh meta failed:", e);
    res.status(500).json({ ok:false, error:"refresh_failed" });
  }
});

app.listen(PORT, () => {
  console.log(`SQLite dev API listening on http://127.0.0.1:${PORT}`);
  console.log(`Using DB: ${SQLITE_PATH}`);
});
