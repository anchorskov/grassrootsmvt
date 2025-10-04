/// <reference path="./globals.d.ts" />

export interface Env {
  wy: D1Database;
  ACCESS_HEADER: string;
}

type JSONValue = string | number | boolean | null | JSONObject | JSONArray;
interface JSONObject { [k: string]: JSONValue }
interface JSONArray extends Array<JSONValue> {}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers || {}) }
  });

const ALLOW_ORIGIN = "https://volunteers.grassrootsmvt.org"; // set your UI origin
const cors = {
  "access-control-allow-origin": ALLOW_ORIGIN,
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type, cf-access-jwt-assertion",
  "access-control-allow-credentials": "true",
  "vary": "origin"
};

const requireUser = (req: Request, env: Env) => {
  const email = req.headers.get(env.ACCESS_HEADER);
  if (email) return email.toLowerCase();

  // Fallback: accept Cloudflare Access JWT from header or cookie
  const jwt = getAccessJWT(req);
  if (!jwt) throw new Response("Unauthorized (Cloudflare Access required)", { status: 401, headers: cors });
  // If we only have a JWT (no email header), return the raw token as the identity string.
  return jwt;
};

async function whoami(req: Request, env: Env) {
  const email = req.headers.get(env.ACCESS_HEADER);
  if (email) return json({ email }, { headers: cors });

  const jwt = getAccessJWT(req);
  if (jwt) return json({ jwt }, { headers: cors });

  return json({ email: "unknown" }, { headers: cors });
}

// Helper: accept Cloudflare Access JWT either via header or cookie
function getAccessJWT(req: Request): string | null {
  const hdr = req.headers.get('Cf-Access-Jwt-Assertion');
  if (hdr) return hdr;
  const cookie = req.headers.get('Cookie') || '';
  const m = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

function canonicalizeStreet(s: string | null | undefined) {
  if (!s) return s;
  let t = String(s).toUpperCase().trim();
  t = t.replace(/^NORTH\s+/, 'N ').replace(/^SOUTH\s+/, 'S ').replace(/^EAST\s+/, 'E ').replace(/^WEST\s+/, 'W ');
  t = t.replace(/\s+NORTH$/, ' N').replace(/\s+SOUTH$/, ' S').replace(/\s+EAST$/, ' E').replace(/\s+WEST$/, ' W');
  const map: Array<[RegExp, string]> = [
    [/\bSTREET\b/g, 'ST'], [/\bAVENUE\b/g, 'AVE'], [/\bDRIVE\b/g, 'DR'], [/\bROAD\b/g, 'RD'],
    [/\bCOURT\b/g, 'CT'], [/\bLANE\b/g, 'LN'], [/\bBOULEVARD\b/g, 'BLVD']
  ];
  for (const [re, rep] of map) t = t.replace(re, rep);
  t = t.replace(/\s+/g, ' ').trim();
  // Move directional before suffix: if penultimate token is direction and last is suffix
  try {
    const toks = t.split(' ');
    const sufSet = new Set(['ST','AVE','RD','BLVD','DR','LN','CT','PL']);
    const dirSet = new Set(['N','S','E','W','NORTH','SOUTH','EAST','WEST']);
    if (toks.length >= 3) {
      const last = toks[toks.length-1];
      const pen = toks[toks.length-2];
      if (sufSet.has(last) && dirSet.has(pen)) {
        toks.splice(toks.length-2, 1);
        toks.unshift(pen);
        t = toks.join(' ');
      }
    }
  } catch (e) { /* ignore */ }
  t = t.replace(/\bNORTH\b/g, 'N').replace(/\bSOUTH\b/g, 'S').replace(/\bEAST\b/g, 'E').replace(/\bWEST\b/g, 'W');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

function normalizeStreetInput(s: string | null | undefined) {
  const SUFFIX: Record<string,string> = {
    'STREET':'ST','ST':'ST', 'AVENUE':'AVE','AVE':'AVE', 'ROAD':'RD','RD':'RD',
    'DRIVE':'DR','DR':'DR', 'LANE':'LN','LN':'LN', 'COURT':'CT','CT':'CT',
    'PLACE':'PL','PL':'PL','BOULEVARD':'BLVD','BLVD':'BLVD','PARKWAY':'PKWY','PKWY':'PKWY',
    'TERRACE':'TER','TER':'TER','HIGHWAY':'HWY','HWY':'HWY','CIRCLE':'CIR','CIR':'CIR','WAY':'WAY'
  };
  const DIR: Record<string,string> = { NORTH:'N', N:'N', SOUTH:'S', S:'S', EAST:'E', E:'E', WEST:'W', W:'W' };
  const UNIT = new Set(['APT','APARTMENT','UNIT','STE','SUITE','#']);

  let t = (s || '').toString().toUpperCase().replace(/[.,]/g,' ').replace(/\s+/g,' ').trim();
  if (!t) return { base: '', abbr: '', full: '' };

  // remove unit tokens and the token after them
  const toks = t.split(' ');
  const cleaned: string[] = [];
  let skip = false;
  for (let i = 0; i < toks.length; i++) {
    const tok = toks[i];
    if (skip) { skip = false; continue; }
    if (tok === '#') { skip = true; continue; }
    if (UNIT.has(tok)) { skip = true; continue; }
    cleaned.push(tok);
  }
  t = cleaned.join(' ');

  // drop leading house number
  const parts = t.split(' ');
  let start = 0;
  if (/^\d+[A-Z]?$/.test(parts[0])) start = 1;
  let tokens = parts.slice(start);
  if (!tokens.length) return { base: '', abbr: '', full: '' };

  // drop leading directional
  if (tokens.length > 1 && DIR[tokens[0]]) tokens = tokens.slice(1);
  // drop trailing directional
  if (tokens.length > 1 && DIR[tokens[tokens.length-1]]) tokens = tokens.slice(0,-1);

  // map suffix
  let suffix = tokens[tokens.length-1];
  const mapped = SUFFIX[suffix] || suffix;
  if (mapped !== suffix) tokens = tokens.slice(0,-1).concat(mapped);

  const full = tokens.join(' ');
  const abbr = full; // tokens already use abbreviated suffix where possible
  const base = tokens.slice(0,-1).join(' ') || full;
  // try to produce an expanded form if we mapped a short suffix
  let expanded = full;
  for (const k of Object.keys(SUFFIX)) {
    if (SUFFIX[k] === tokens[tokens.length-1] && k.length > SUFFIX[k].length) {
      expanded = tokens.slice(0,-1).concat(k).join(' ');
      break;
    }
  }
  return { base, abbr, full: expanded };
}

/** Canvass nearby (D1) - POST { filters, street, house, range?, limit? } */
async function canvassNearby(req: Request, env: Env) {
  const body = (await req.json().catch(() => ({}))) as any;
  const f0 = body?.filters || {};
  const filters = {
    county: (f0.county || null) ? String(f0.county).trim().toUpperCase() : null,
    city:   (f0.city   || null) ? String(f0.city).trim().toUpperCase() : null,
    district_type: f0.district_type || null,
    district: f0.district || null,
    parties: Array.isArray(f0.parties) ? f0.parties.filter(Boolean) : (f0.parties ? [f0.parties] : []),
    require_phone: !!f0.require_phone
  };

  const streetIn = String(body?.street || '').trim().toUpperCase();
  const houseIn  = Number(body?.house || 0);
  const range    = Math.max(0, Math.min(200, Number(body?.range || 20)));
  const limit    = Math.max(1, Math.min(200, Number(body?.limit || 20)));
  if (!streetIn || !houseIn) return json({ ok:false, error:'missing_house_or_street' }, { status:400, headers: cors });

  // normalize to abbreviated and expanded forms for LIKE-pattern matching
  const { abbr, full } = normalizeStreetInput(streetIn);

  // Build WHERE fragments
  const buildWhere = (includeDistrict: boolean) => {
    const cond: string[] = [];
    const params: (string|number)[] = [];
    if (filters.county) { cond.push(`v.county = ?`); params.push(filters.county); }
    if (filters.city)   { cond.push(`n.city = ?`);   params.push(filters.city); }
    if (includeDistrict && filters.district_type && filters.district) {
      if (filters.district_type === 'house')  { cond.push(`n.house = ?`); params.push(filters.district); }
      if (filters.district_type === 'senate') { cond.push(`n.senate = ?`); params.push(filters.district); }
    }
    if (filters.parties?.length) { const ph = filters.parties.map(()=>'?').join(','); cond.push(`v.political_party IN (${ph})`); params.push(...filters.parties); }
    return { cond, params };
  };

  const runQuery = async (includeDistrict: boolean) => {
    const { cond, params } = buildWhere(includeDistrict);
    const extra = cond.length ? ` AND ${cond.join(' AND ')}` : '';
    const sql = `
      WITH base AS (
        SELECT n.voter_id, n.fn, n.ln, n.addr1, n.city, n.zip, n.house, n.senate,
          CAST(CASE WHEN INSTR(UPPER(TRIM(n.addr1)),' ') > 0 THEN SUBSTR(UPPER(TRIM(n.addr1)),1,INSTR(UPPER(TRIM(n.addr1)),' ')-1) ELSE UPPER(TRIM(n.addr1)) END AS INTEGER) AS num,
          TRIM(CASE WHEN INSTR(UPPER(TRIM(n.addr1)),' ') > 0 THEN SUBSTR(UPPER(TRIM(n.addr1)), INSTR(UPPER(TRIM(n.addr1)),' ')+1) ELSE '' END) AS street_raw
        FROM v_voters_addr_norm n
      ), norm AS (
        SELECT *, REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(street_raw,'  ',' '),'STREET','ST'),'AVENUE','AVE'),'DRIVE','DR'),'ROAD','RD'),'LANE','LN'),'BOULEVARD','BLVD') AS street FROM base
      )
      SELECT v.voter_id, (norm.fn || ' ' || norm.ln) AS name, norm.addr1 AS address, norm.city, norm.zip, v.political_party AS party, bp.phone_e164 AS phone_e164, bp.confidence_code AS phone_confidence
      FROM norm
      JOIN voters v ON v.voter_id = norm.voter_id
      LEFT JOIN v_best_phone bp ON bp.voter_id = v.voter_id
      WHERE (norm.addr1 LIKE ? OR norm.addr1 LIKE ?) AND norm.num BETWEEN ? AND ? ${extra}
      ORDER BY ABS(norm.num - ?)
      LIMIT ?;
    `;
    const patterns = [`% ${abbr}%`, `% ${full}%`];
    const args = [patterns[0], patterns[1], houseIn - range, houseIn + range, ...params, houseIn, limit];
  const stmt = env.wy.prepare(sql);
  const result = await stmt.all(...args);
  return (result as any).results || [];
  };

  // nearest fallback: if ranged query returns nothing, return nearest addresses on same street
  const runNearest = async (includeDistrict: boolean) => {
    const { cond, params } = buildWhere(includeDistrict);
    const extra = cond.length ? ` AND ${cond.join(' AND ')}` : '';
    const sql = `
      WITH base AS (
        SELECT n.voter_id, n.fn, n.ln, n.addr1, n.city, n.zip, n.house, n.senate,
          CAST(CASE WHEN INSTR(UPPER(TRIM(n.addr1)),' ') > 0 THEN SUBSTR(UPPER(TRIM(n.addr1)),1,INSTR(UPPER(TRIM(n.addr1)),' ')-1) ELSE UPPER(TRIM(n.addr1)) END AS INTEGER) AS num,
          TRIM(CASE WHEN INSTR(UPPER(TRIM(n.addr1)),' ') > 0 THEN SUBSTR(UPPER(TRIM(n.addr1)), INSTR(UPPER(TRIM(n.addr1)),' ')+1) ELSE '' END) AS street_raw
        FROM v_voters_addr_norm n
      ), norm AS (
        SELECT *, REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(street_raw,'  ',' '),'STREET','ST'),'AVENUE','AVE'),'DRIVE','DR'),'ROAD','RD'),'LANE','LN'),'BOULEVARD','BLVD') AS street FROM base
      )
      SELECT v.voter_id, (norm.fn || ' ' || norm.ln) AS name, norm.addr1 AS address, norm.city, norm.zip,
             v.political_party AS party, bp.phone_e164 AS phone_e164, bp.confidence_code AS phone_confidence,
             ABS(norm.num - ?) AS house_distance
      FROM norm
      JOIN voters v ON v.voter_id = norm.voter_id
      LEFT JOIN v_best_phone bp ON bp.voter_id = v.voter_id
      WHERE (norm.addr1 LIKE ? OR norm.addr1 LIKE ?) AND norm.num IS NOT NULL ${extra}
      ORDER BY house_distance, norm.num
      LIMIT ?;
    `;
    const patterns = [`% ${abbr}%`, `% ${full}%`];
    const args = [houseIn, patterns[0], patterns[1], ...params, limit];
    const stmt = env.wy.prepare(sql);
    const result = await stmt.all(...args);
    return (result as any).results || [];
  };

  let rows = await runQuery(true);
  let broadened = false;
  if (!rows || rows.length === 0) { rows = await runQuery(false); broadened = true; }

  let fallback_nearest = false;
  if ((!rows || rows.length === 0) && houseIn) {
    rows = await runNearest(true);
    if (!rows || rows.length === 0) rows = await runNearest(false);
    fallback_nearest = true;
  }

  return json({ ok:true, rows, filters, input:{ street: abbr, house: houseIn, range, limit }, broadened, fallback_nearest }, { headers: cors });
}

/** Lock next eligible voter (expects v_eligible_call view to exist) */
async function callNext(req: Request, env: Env) {
  const user = requireUser(req, env);

  const res = await env.wy.batch([
    env.wy.prepare(`INSERT INTO call_assignments (voter_id, volunteer_id, lock_expires_at)
      SELECT voter_id, ?, DATETIME('now', '+10 minutes')
      FROM v_eligible_call
      WHERE voter_id NOT IN (SELECT voter_id FROM call_assignments WHERE lock_expires_at > CURRENT_TIMESTAMP)
      LIMIT 1;`).bind(user),
    env.wy.prepare(`SELECT r.voter_id, r.first_name, r.last_name, r.ra_city, r.ra_zip,
                           n.party_form5 AS party, bp.phone_e164
                    FROM call_assignments ca
                    JOIN voters_raw r ON r.voter_id = ca.voter_id
                    JOIN voters_norm n USING(voter_id)
                    LEFT JOIN v_best_phone bp USING(voter_id)
                    WHERE ca.volunteer_id = ?
                    ORDER BY ca.locked_at DESC
                    LIMIT 1;`).bind(user)
  ]);
  const rows = (res[1] as D1Result).results || [];
  return json(rows[0] || null, { headers: cors });
}

/** Complete a call: write contact, optional follow-up, release lock */
async function callComplete(req: Request, env: Env) {
  const user = requireUser(req, env);
  const body = (await req.json().catch(() => ({}))) as JSONObject;

  const voter_id = String(body["voter_id"] || "");
  const outcome  = String(body["outcome"]  || "");

  if (!voter_id || !outcome) return json({ error: "voter_id and outcome required" }, { status: 400, headers: cors });

  const fields = {
    ok_callback: body["ok_callback"] ?? null,
    best_day: body["best_day"] ?? null,
    best_time_window: body["best_time_window"] ?? null,
    requested_info: body["requested_info"] ?? null,
    dnc: body["dnc"] ?? null,
    optin_sms: body["optin_sms"] ?? null,
    optin_email: body["optin_email"] ?? null,
    email: body["email"] ?? null,
    wants_volunteer: body["wants_volunteer"] ?? null,
    share_insights_ok: body["share_insights_ok"] ?? null,
    for_term_limits: body["for_term_limits"] ?? null,
    issue_public_lands: body["issue_public_lands"] ?? null,
    comments: body["comments"] ?? null
  };

  const insertContact = env.wy.prepare(
    `INSERT INTO voter_contacts
     (voter_id, volunteer_id, method, outcome, ok_callback, best_day, best_time_window,
      requested_info, dnc, optin_sms, optin_email, email, wants_volunteer, share_insights_ok,
      for_term_limits, issue_public_lands, comments)
     VALUES (?, ?, 'phone', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    voter_id, user, outcome,
    fields.ok_callback, fields.best_day, fields.best_time_window,
    fields.requested_info, fields.dnc, fields.optin_sms, fields.optin_email, fields.email,
    fields.wants_volunteer, fields.share_insights_ok, fields.for_term_limits, fields.issue_public_lands,
    fields.comments
  );

  const maybeFollow = (Number(fields.ok_callback) === 1 || Number(fields.requested_info) === 1)
    ? env.wy.prepare(`INSERT INTO call_followups (voter_id, due_date, reason, created_by)
                      VALUES (?, NULL, ?, ?)`)
        .bind(voter_id, Number(fields.ok_callback) === 1 ? "callback_window" : "requested_info", user)
    : env.wy.prepare("SELECT 1");

  const release = env.wy.prepare(`DELETE FROM call_assignments WHERE voter_id=?`).bind(voter_id);

  await env.wy.batch([insertContact, maybeFollow, release]);
  return json({ ok: true }, { headers: cors });
}

export default {
  async fetch(req: Request, env: Env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const url = new URL(req.url);

  if (url.pathname === "/whoami") return whoami(req, env);
  if (url.pathname === "/canvass/nearby" && req.method === "POST") return canvassNearby(req, env);
    if (url.pathname === "/call/next" && req.method === "POST") return callNext(req, env);
    if (url.pathname === "/call/complete" && req.method === "POST") return callComplete(req, env);

    return new Response("ok", { headers: cors });
  }
} as any;
