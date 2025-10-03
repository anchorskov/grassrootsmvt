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

const db = new Database(SQLITE_PATH, { readonly: true });

// helpers
const q  = (sql, ...args) => db.prepare(sql).all(...args);
const q1 = (sql, ...args) => db.prepare(sql).get(...args);
const uniq = (arr) => Array.from(new Set(arr)).filter(Boolean);
// helper: Upper-case safe normalizer
const up = (s) => (s ?? "").toString().trim().toUpperCase();

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
  const filters = {
    county: f.county || null,
    city: f.city || null,
    district_type: f.district_type || null, // 'house' | 'senate'
    district: f.district || null,
    parties: Array.isArray(f.parties) ? f.parties.filter(Boolean) : (f.parties ? [f.parties] : []),
    q: f.q || null,
    limit: Math.max(1, Math.min(200, Number(f.limit || 50))),
  };
  // normalize for DB comparisons
  filters.county = filters.county ? up(filters.county) : null;
  filters.city   = filters.city   ? up(filters.city)   : null;
  if (filters.q) filters.q = up(filters.q);
  return filters;
}

function whereAndParams(filters) {
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
    cond.push(`( n.addr1 LIKE ? OR n.city LIKE ? OR (n.fn || ' ' || n.ln) LIKE ? )`);
    const like = `%${filters.q}%`.toUpperCase();
    p.push(like, like, like);
  }
  return { cond, p };
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

// --- Call next: GET/POST (one record) ---
app.all("/api/call/next", (req, res) => {
  try {
    const filters = parseFilters(req);
    const { cond, p } = whereAndParams(filters);
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";

    const sql = `
      SELECT v.voter_id,
             n.fn AS first_name,
             n.ln AS last_name,
             v.political_party AS party,
             n.city  AS ra_city,
             n.zip   AS ra_zip,
             bp.phone_e164
      FROM voters v
      JOIN v_voters_addr_norm n ON n.voter_id = v.voter_id
      LEFT JOIN v_best_phone bp ON bp.voter_id = v.voter_id
      ${where}
      ORDER BY RANDOM()
      LIMIT 1
    `;
    const row = q1(sql, ...p);
    if (!row) {
      return res.json({ ok:true, filters, empty:true });
    }
    res.json({ ok:true, ...row, filters });
  } catch (e) {
    console.error("ALL /api/call/next error:", e);
    res.status(500).json({ ok:false, error:"call_next_failed" });
  }
});

// --- Call complete: POST (echo stub) ---
app.post("/api/call/complete", (req, res) => {
  const body = req.body || {};
  // In a future step, insert into a local log table or file.
  res.json({ ok:true, saved: body, ts: new Date().toISOString() });
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
