// Path: worker/src/index.js
import { router } from './router.js';
import { getEnvironmentConfig } from './utils/env.js';
import { pickAllowedOrigin, preflightResponse, parseAllowedOrigins } from './utils/cors.js';
import { requireAuth, requireAdmin, isAdmin } from './auth.js';

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const tableCache = new Map();
const tableColumnsCache = new Map();

class DependencyMissingError extends Error {
  constructor(table) {
    super(`Missing required table: ${table}`);
    this.name = 'DependencyMissingError';
    this.table = table;
  }
}

class BadRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BadRequestError';
    this.status = 400;
  }
}

function getDb(env) {
  return env?.d1 ?? env?.DB ?? null;
}

function buildHeaders(allowedOrigin, extra = {}) {
  return {
    'content-type': JSON_CONTENT_TYPE,
    'access-control-allow-origin': allowedOrigin,
    'access-control-allow-credentials': 'true',
    vary: 'Origin',
    ...extra,
  };
}

function jsonResponse(data, status = 200, allowedOrigin = '*', extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: buildHeaders(allowedOrigin, extraHeaders),
  });
}

function missingTableResponse(table, allowedOrigin) {
  return jsonResponse(
    { error: 'dependency_missing', detail: `table ${table} not found` },
    503,
    allowedOrigin
  );
}

function buildStatement(db, sql, params = []) {
  const statement = db.prepare(sql);
  return params.length ? statement.bind(...params) : statement;
}

async function resolveTable(env, candidates) {
  const db = getDb(env);
  if (!db) {
    throw new DependencyMissingError(candidates[0] ?? 'd1_binding');
  }
  const key = candidates.join('|');
  if (tableCache.has(key)) {
    return tableCache.get(key);
  }
  for (const name of candidates) {
    try {
      const result = await buildStatement(
        db,
        `SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name = ?1`,
        [name]
      ).all();
      if (result?.results?.some(row => row.name === name)) {
        tableCache.set(key, name);
        return name;
      }
    } catch (err) {
      const message = String(err?.message || err).toLowerCase();
      if (message.includes('no such table') || message.includes('no such function')) {
        continue;
      }
      throw err;
    }
  }
  throw new DependencyMissingError(candidates[candidates.length - 1] ?? candidates[0]);
}

async function getTableColumns(env, table) {
  const cacheKey = table;
  if (tableColumnsCache.has(cacheKey)) {
    return tableColumnsCache.get(cacheKey);
  }
  const db = getDb(env);
  if (!db) return [];
  const result = await buildStatement(db, `PRAGMA table_info(${table});`).all();
  const columns = (result.results || []).map(column => column.name);
  tableColumnsCache.set(cacheKey, columns);
  return columns;
}

async function ensureAuth(request, env, config) {
  const guard = requireAuth(env);
  let authorized = false;
  await guard({ req: request, env }, async () => {
    authorized = true;
  });
  if (!authorized) {
    const error = new Error('unauthorized');
    error.status = 401;
    throw error;
  }
  const headerEmail =
    request.headers.get('Cf-Access-Authenticated-User-Email') ||
    request.headers.get('cf-access-authenticated-user-email') ||
    null;
  return {
    email: headerEmail || (config.isLocal ? 'dev@localhost' : null),
    authenticated: !!headerEmail || config.isLocal,
    isLocal: config.isLocal,
  };
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new BadRequestError('Invalid JSON body');
  }
}

function parseVoterIds(paramValue) {
  return String(paramValue || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

async function handleApiRequest(request, env, cfCtx) {
  const config = getEnvironmentConfig(env);
  const allowedOrigin = pickAllowedOrigin(request, env);
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/';

  if (request.method === 'OPTIONS') {
    return preflightResponse(allowedOrigin, request);
  }

  const ctx = {
    config,
    allowedOrigin,
    path,
    jsonResponse: (data, status = 200, origin = allowedOrigin, extraHeaders = {}) =>
      jsonResponse(data, status, origin, extraHeaders),
  };

  try {
    return router(request, env, cfCtx, ctx);
  } catch (err) {
    console.error('[worker] unhandled error', err);
    const status = err?.status && Number.isInteger(err.status) ? err.status : 500;
    return jsonResponse(
      { ok: false, error: String(err?.message || err) },
      status,
      allowedOrigin
    );
  }
}

async function handleAssetRequest(request, env) {
  if (!env.ASSETS) {
    return new Response('ASSETS binding is not configured', { status: 500 });
  }

  const assetResponse = await env.ASSETS.fetch(request);
  if (assetResponse.status === 404 && request.method === 'GET') {
    const accept = request.headers.get('accept') || '';
    if (accept && accept.includes('text/html')) {
      const fallbackUrl = new URL('/', request.url);
      const fallbackRequest = new Request(fallbackUrl.toString(), request);
      return env.ASSETS.fetch(fallbackRequest);
    }
  }
  return assetResponse;
}

export default {
  async fetch(request, env, cfCtx) {
    const url = new URL(request.url);

    // Suppress Chrome DevTools noise
    if (url.pathname.startsWith('/.well-known/')) {
      return new Response(null, { status: 404 });
    }

    if (url.pathname === '/src/apiClient.js') {
      url.pathname = '/src/apiClient.v2.js';
      url.searchParams.set('v', '2025-10-30a');
      return Response.redirect(url.toString(), 302);
    }

    const isApiRequest = url.pathname === '/api' || url.pathname.startsWith('/api/');
    if (isApiRequest) {
      return handleApiRequest(request, env, cfCtx);
    }

    if (url.pathname === '/src/api-shim.js') {
      return new Response('// shim removed', {
        status: 200,
        headers: {
          'Content-Type': 'application/javascript',
          'Cache-Control': 'no-store',
        },
      });
    }

    const assetResponse = await handleAssetRequest(request, env);
    if (url.pathname.startsWith('/src/apiClient.v2.js')) {
      const headers = new Headers(assetResponse.headers);
      headers.set('Cache-Control', 'no-store');
      return new Response(assetResponse.body, {
        status: assetResponse.status,
        headers,
      });
    }
    return assetResponse;
  },
};

router.get('/ping', async (request, env, ctx) => {
  const url = new URL(request.url);
  const finish = url.searchParams.get('finish');
  if (finish) {
    try {
      return Response.redirect(finish, 302);
    } catch (err) {
      console.warn('[ping] redirect failed', err);
    }
  }
  return ctx.jsonResponse(
    {
      ok: true,
      worker: 'grassrootsmvt',
      environment: ctx.config.environment,
      timestamp: Date.now(),
      auth: ctx.config.isLocal ? 'bypassed' : 'cf_access',
    },
    200,
    ctx.allowedOrigin
  );
});

router.get('/whoami', async (request, env, ctx) => {
  const url = new URL(request.url);
  const nav = url.searchParams.get('nav');
  const to = url.searchParams.get('to');

  if (nav === '1' && to) {
    try {
      const auth = await ensureAuth(request, env, ctx.config);
      if (auth?.email) {
        const allowedOrigins = parseAllowedOrigins(env);
        const fallbackOrigin = allowedOrigins[0] || url.origin || 'https://volunteers.grassrootsmvt.org';
        const dest = (() => {
          try {
            const target = new URL(to);
            return allowedOrigins.includes(target.origin)
              ? target.toString()
              : `${fallbackOrigin.replace(/\/+$/, '')}/`;
          } catch {
            return `${fallbackOrigin.replace(/\/+$/, '')}/`;
          }
        })();
        return Response.redirect(dest, 302);
      }
    } catch {
      // fall through to login redirect
    }

    const team = env.TEAM_DOMAIN;
    const aud = env.POLICY_AUD;
    if (team && aud) {
      const loginBase = team.replace(/\/+$/, '');
      const appHost = url.host || url.hostname;
      const returnPath = url.pathname || '/api/whoami';
      const back = encodeURIComponent(`${returnPath}?nav=1&to=${encodeURIComponent(to)}`);
      const login = `${loginBase}/cdn-cgi/access/login/${appHost}?kid=${aud}&redirect_url=${back}`;
      return Response.redirect(login, 302);
    }
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const auth = await ensureAuth(request, env, ctx.config);
    if (!auth.email) {
      return ctx.jsonResponse(
        { ok: false, authenticated: false, error: 'unauthorized' },
        401,
        ctx.allowedOrigin
      );
    }
    return ctx.jsonResponse(
      {
        ok: true,
        authenticated: auth.authenticated,
        email: auth.email,
        isLocal: auth.isLocal,
      },
      200,
      ctx.allowedOrigin
    );
  } catch (err) {
    const status = err?.status === 401 ? 401 : 500;
    return ctx.jsonResponse(
      { ok: false, authenticated: false, error: String(err?.message || err) },
      status,
      ctx.allowedOrigin
    );
  }
});

router.get('/metadata', async (request, env, ctx) => {
  const db = getDb(env);
  if (!db) {
    // TODO: Provision D1 table voters required by /metadata route.
    return missingTableResponse('voters', ctx.allowedOrigin);
  }

  const url = new URL(request.url);
  const countyParam = url.searchParams.get('city');
  const houseDistrict = url.searchParams.get('house_district');
  const senateDistrict = url.searchParams.get('senate_district');
  const normalizeDistrictInput = value => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const num = Number(trimmed);
    if (!Number.isNaN(num)) {
      return String(Math.abs(num)).padStart(2, '0');
    }
    return trimmed.toUpperCase();
  };

  const getCoverageTable = async () => {
    try {
      return await resolveTable(env, ['district_coverage']);
    } catch (err) {
      if (err instanceof DependencyMissingError) return null;
      throw err;
    }
  };

  try {
    const coverageTable = await getCoverageTable();
    const votersTable = await resolveTable(env, ['voters']);

    if (coverageTable) {
      if (houseDistrict || senateDistrict) {
        const districtType = houseDistrict ? 'house' : 'senate';
        const districtCode = normalizeDistrictInput(houseDistrict || senateDistrict);
        const coverageResult = await buildStatement(
          db,
          `SELECT county, city FROM ${coverageTable}
           WHERE district_type = ?1 AND district_code = ?2
           ORDER BY county, city`,
          [districtType, districtCode]
        ).all();
        const coverageRows = coverageResult.results ?? [];
        const counties = Array.from(new Set(coverageRows.map(row => row.county)));
        const cities = Array.from(
          new Set(
            coverageRows
              .map(row => row.city)
              .filter(Boolean)
          )
        );
        return ctx.jsonResponse(
          {
            ok: true,
            mode: districtType === 'house' ? 'house_to_city' : 'senate_to_city',
            district: districtCode,
            counties,
            cities,
          },
          200,
          ctx.allowedOrigin,
          { 'Cache-Control': 'max-age=86400' }
        );
      }

      if (countyParam) {
        const county = countyParam.toUpperCase();
        const [houseResult, senateResult] = await Promise.all([
          buildStatement(
            db,
            `SELECT DISTINCT district_code FROM ${coverageTable}
             WHERE district_type = 'house' AND county = ?1
             ORDER BY CAST(district_code AS INTEGER)`,
            [county]
          ).all(),
          buildStatement(
            db,
            `SELECT DISTINCT district_code FROM ${coverageTable}
             WHERE district_type = 'senate' AND county = ?1
             ORDER BY CAST(district_code AS INTEGER)`,
            [county]
          ).all(),
        ]);
        return ctx.jsonResponse(
          {
            ok: true,
            mode: 'city_to_district',
            city: county,
            house_districts: (houseResult.results ?? []).map(row => row.district_code),
            senate_districts: (senateResult.results ?? []).map(row => row.district_code),
          },
          200,
          ctx.allowedOrigin,
          { 'Cache-Control': 'max-age=86400' }
        );
      }

      const [countiesResult, houseCodesResult, senateCodesResult] = await Promise.all([
        buildStatement(
          db,
          `SELECT DISTINCT county FROM ${coverageTable} ORDER BY county`
        ).all(),
        buildStatement(
          db,
          `SELECT DISTINCT district_code FROM ${coverageTable}
           WHERE district_type = 'house'
           ORDER BY CAST(district_code AS INTEGER)`
        ).all(),
        buildStatement(
          db,
          `SELECT DISTINCT district_code FROM ${coverageTable}
           WHERE district_type = 'senate'
           ORDER BY CAST(district_code AS INTEGER)`
        ).all(),
      ]);

      return ctx.jsonResponse(
        {
          ok: true,
          mode: 'default',
          state: 'WY',
          counties: (countiesResult.results ?? []).map(row => row.county),
          cities: (countiesResult.results ?? []).map(row => row.county),
          house_districts: (houseCodesResult.results ?? []).map(row => row.district_code),
          senate_districts: (senateCodesResult.results ?? []).map(row => row.district_code),
          auto_populate: false,
        },
        200,
        ctx.allowedOrigin,
        { 'Cache-Control': 'max-age=86400' }
      );
    }

    // Fallback to legacy behavior if district_coverage table is missing.
    if (houseDistrict || senateDistrict) {
      const districtField = houseDistrict ? 'house' : 'senate';
      const districtValue = houseDistrict || senateDistrict;
      const result = await buildStatement(
        db,
        `SELECT DISTINCT county FROM ${votersTable}
         WHERE ${districtField} = ?1
           AND county IS NOT NULL
           AND county != ''
         ORDER BY county`,
        [districtValue]
      ).all();
      const counties = (result.results ?? []).map(row => row.county);
      return ctx.jsonResponse(
        {
          ok: true,
          mode: districtField === 'house' ? 'house_to_city' : 'senate_to_city',
          district: districtValue,
          cities: ['(ALL)', ...counties],
        },
        200,
        ctx.allowedOrigin,
        { 'Cache-Control': 'max-age=86400' }
      );
    }

    if (countyParam) {
      const [houseResult, senateResult] = await Promise.all([
        buildStatement(
          db,
          `SELECT DISTINCT house FROM ${votersTable}
           WHERE county = ?1
             AND house IS NOT NULL
             AND house != ''
           ORDER BY CAST(house AS INTEGER)`,
          [countyParam]
        ).all(),
        buildStatement(
          db,
          `SELECT DISTINCT senate FROM ${votersTable}
           WHERE county = ?1
             AND senate IS NOT NULL
             AND senate != ''
           ORDER BY CAST(senate AS INTEGER)`,
          [countyParam]
        ).all(),
      ]);
      return ctx.jsonResponse(
        {
          ok: true,
          mode: 'city_to_district',
          city: countyParam,
          house_districts: (houseResult.results ?? []).map(row => row.house),
          senate_districts: (senateResult.results ?? []).map(row => row.senate),
        },
        200,
        ctx.allowedOrigin,
        { 'Cache-Control': 'max-age=86400' }
      );
    }

    const [counties, houseDistricts, senateDistricts] = await Promise.all([
      buildStatement(
        db,
        `SELECT DISTINCT county FROM ${votersTable}
         WHERE county IS NOT NULL
           AND county != ''
         ORDER BY county`
      ).all(),
      buildStatement(
        db,
        `SELECT DISTINCT house FROM ${votersTable}
         WHERE house IS NOT NULL
           AND house != ''
         ORDER BY CAST(house AS INTEGER)`
      ).all(),
      buildStatement(
        db,
        `SELECT DISTINCT senate FROM ${votersTable}
         WHERE senate IS NOT NULL
           AND senate != ''
         ORDER BY CAST(senate AS INTEGER)`
      ).all(),
    ]);

    const countyList = counties.results ?? [];

    return ctx.jsonResponse(
      {
        ok: true,
        mode: 'default',
        state: 'WY',
        counties: countyList.map(row => row.county),
        cities: countyList.map(row => row.county),
        house_districts: (houseDistricts.results ?? []).map(row => row.house),
        senate_districts: (senateDistricts.results ?? []).map(row => row.senate),
        auto_populate: false,
      },
      200,
      ctx.allowedOrigin,
      { 'Cache-Control': 'max-age=86400' }
    );
  } catch (err) {
    if (err instanceof DependencyMissingError) {
      return missingTableResponse(err.table, ctx.allowedOrigin);
    }
    console.error('/metadata error', err);
    return ctx.jsonResponse(
      { ok: false, error: 'metadata_query_failed', message: String(err?.message || err) },
      500,
      ctx.allowedOrigin
    );
  }
});

router.get('/templates', async (request, env, ctx) => {
  const db = getDb(env);
  if (!db) {
    // TODO: Provision D1 table message_templates required by /templates route.
    return missingTableResponse('message_templates', ctx.allowedOrigin);
  }
  const url = new URL(request.url);
  const category = url.searchParams.get('category');

  try {
    const table = await resolveTable(env, ['message_templates']);
    let sql = `SELECT id, title, category, body_text FROM ${table} WHERE is_active = 1`;
    const params = [];
    if (category) {
      sql += ' AND category = ?1';
      params.push(category);
    }
    sql += ' ORDER BY id';
    const result = await buildStatement(db, sql, params).all();
    return ctx.jsonResponse(
      { ok: true, templates: result.results ?? [] },
      200,
      ctx.allowedOrigin,
      { 'Cache-Control': 'max-age=300' }
    );
  } catch (err) {
    if (err instanceof DependencyMissingError) {
      // TODO: Provision D1 table message_templates required by /templates route.
      return missingTableResponse(err.table, ctx.allowedOrigin);
    }
    console.error('/templates error', err);
    return ctx.jsonResponse(
      { ok: false, error: 'templates_query_failed', message: String(err?.message || err) },
      500,
      ctx.allowedOrigin
    );
  }
});

router.get('/db/tables', async (_request, env, ctx) => {
  const db = getDb(env);
  if (!db) {
    // TODO: Provision D1 database binding required for /db/tables route.
    return missingTableResponse('sqlite_master', ctx.allowedOrigin);
  }
  try {
    const result = await buildStatement(
      db,
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all();
    return ctx.jsonResponse(
      {
        ok: true,
        tables: result.results ?? [],
        environment: env.ENVIRONMENT || ctx.config.environment,
      },
      200,
      ctx.allowedOrigin
    );
  } catch (err) {
    console.error('/db/tables error', err);
    return ctx.jsonResponse(
      { ok: false, error: String(err?.message || err) },
      500,
      ctx.allowedOrigin
    );
  }
});

router.get('/db/schema', async (request, env, ctx) => {
  const url = new URL(request.url);
  const tableParam = url.searchParams.get('table');
  if (!tableParam) {
    return ctx.jsonResponse(
      { ok: false, error: 'table parameter required' },
      400,
      ctx.allowedOrigin
    );
  }
  const db = getDb(env);
  if (!db) {
    // TODO: Provision D1 table required by /db/schema route.
    return missingTableResponse(tableParam, ctx.allowedOrigin);
  }
  try {
    const table = await resolveTable(env, [tableParam]);
    const result = await buildStatement(db, `PRAGMA table_info(${table});`).all();
    return ctx.jsonResponse(
      { ok: true, table, columns: result.results ?? [] },
      200,
      ctx.allowedOrigin
    );
  } catch (err) {
    if (err instanceof DependencyMissingError) {
      // TODO: Provision D1 table required by /db/schema route.
      return missingTableResponse(err.table, ctx.allowedOrigin);
    }
    console.error('/db/schema error', err);
    return ctx.jsonResponse(
      { ok: false, error: String(err?.message || err) },
      500,
      ctx.allowedOrigin
    );
  }
});

router.post('/call', async (request, env, ctx) => {
  let body;
  try {
    body = await readJson(request);
  } catch (err) {
    if (err instanceof BadRequestError) {
      return ctx.jsonResponse({ ok: false, error: err.message }, err.status, ctx.allowedOrigin);
    }
    throw err;
  }

  const db = getDb(env);
  if (!db) {
    // TODO: Provision D1 table call_activity required by /call route.
    return missingTableResponse('call_activity', ctx.allowedOrigin);
  }

  let auth;
  try {
    auth = await ensureAuth(request, env, ctx.config);
  } catch (err) {
    const status = err?.status === 401 ? 401 : 500;
    return ctx.jsonResponse({ ok: false, error: String(err?.message || err) }, status, ctx.allowedOrigin);
  }

  try {
    if (body.filters !== undefined || body.exclude_ids !== undefined) {
      const votersTable = await resolveTable(env, ['voters']);
      const addrTable = await resolveTable(env, ['voters_addr_norm', 'voters_addr', 'voter_addresses']);
      const phonesTable = await resolveTable(env, ['voter_phones', 'best_phone', 'best_phone_view']);
      const contactsTable = await resolveTable(env, ['voter_contacts', 'voter_contact']);
      const filters = body.filters || {};
      const excludeIds = Array.isArray(body.exclude_ids) ? body.exclude_ids : [];
      const excludeContacted = body.exclude_contacted !== false; // Default true

      let sql = `
        SELECT v.voter_id,
               COALESCE(va.fn, '') AS first_name,
               COALESCE(va.ln, '') AS last_name,
               COALESCE(vp.phone_e164, '') AS phone_1,
               '' AS phone_2,
               v.county,
               COALESCE(va.city, '') AS city,
               v.political_party,
               COALESCE(va.house, v.house, '') AS house_district,
               COALESCE(va.senate, v.senate, '') AS senate_district
        FROM ${votersTable} v
        LEFT JOIN ${addrTable} va ON v.voter_id = va.voter_id
        LEFT JOIN ${phonesTable} vp ON v.voter_id = vp.voter_id
        LEFT JOIN ${contactsTable} vc ON v.voter_id = vc.voter_id
        WHERE 1 = 1
      `;
      const params = [];
      let paramIndex = 1;

      // Exclude voters who have already been contacted (unless explicitly disabled)
      if (excludeContacted) {
        sql += ` AND vc.voter_id IS NULL`;
      }

      if (filters.county) {
        sql += ` AND v.county = ?${paramIndex++}`;
        params.push(filters.county);
      }
      if (filters.city) {
        sql += ` AND va.city = ?${paramIndex++}`;
        params.push(filters.city);
      }
      if (Array.isArray(filters.parties) && filters.parties.length) {
        const placeholders = filters.parties.map(() => `?${paramIndex++}`).join(',');
        sql += ` AND v.political_party IN (${placeholders})`;
        params.push(...filters.parties);
      }
      if (filters.require_phone) {
        sql += ' AND vp.phone_e164 IS NOT NULL AND vp.phone_e164 != ""';
      }
      if (filters.district_type && filters.district) {
        const column = filters.district_type === 'senate' ? 'v.senate' : 'v.house';
        sql += ` AND ${column} = ?${paramIndex++}`;
        params.push(filters.district);
      }
      if (excludeIds.length) {
        const placeholders = excludeIds.map(() => `?${paramIndex++}`).join(',');
        sql += ` AND v.voter_id NOT IN (${placeholders})`;
        params.push(...excludeIds);
      }
      sql += ' ORDER BY RANDOM() LIMIT 1';

      const voterResult = await buildStatement(db, sql, params).all();
      const voter = voterResult.results?.[0];

      if (voter) {
        return ctx.jsonResponse(
          {
            ok: true,
            voter_id: voter.voter_id,
            first_name: voter.first_name,
            last_name: voter.last_name,
            phone_1: voter.phone_1,
            phone_2: voter.phone_2,
            county: voter.county,
            city: voter.city,
            political_party: voter.political_party,
            house_district: voter.house_district || null,
            senate_district: voter.senate_district || null,
          },
          200,
          ctx.allowedOrigin
        );
      }

      return ctx.jsonResponse(
        { ok: true, empty: true, message: 'No eligible voters found' },
        200,
        ctx.allowedOrigin
      );
    }

    if (!body.voter_id) {
      return ctx.jsonResponse(
        { ok: false, error: 'Missing required parameters: voter_id' },
        400,
        ctx.allowedOrigin
      );
    }

    const callTable = await resolveTable(env, ['call_activity', 'call_log', 'calls']);
    const columns = await getTableColumns(env, callTable);
    const callResultColumn = columns.includes('call_result')
      ? 'call_result'
      : columns.includes('outcome')
        ? 'outcome'
        : null;
    const notesColumn = columns.includes('notes') ? 'notes' : null;
    const pulseColumn = columns.includes('pulse_opt_in') ? 'pulse_opt_in' : null;
    const pitchColumn = columns.includes('pitch_used') ? 'pitch_used' : null;
    const durationColumn = columns.includes('duration_seconds') ? 'duration_seconds' : null;
    const sentimentColumn = columns.includes('response_sentiment') ? 'response_sentiment' : null;
    const issueColumn = columns.includes('issue_interest') ? 'issue_interest' : null;
    const followupNeededColumn = columns.includes('followup_needed') ? 'followup_needed' : null;
    const followupDateColumn = columns.includes('followup_date') ? 'followup_date' : null;

    const insertColumns = ['voter_id', 'volunteer_email'];
    const params = [body.voter_id, auth.email || 'unknown@local'];

    const addParam = (column, value) => {
      if (!column) return;
      insertColumns.push(column);
      params.push(value);
    };

    addParam(callResultColumn, body.call_result || body.result || 'contacted');
    addParam(notesColumn, body.notes || '');
    addParam(pulseColumn, body.pulse_opt_in ? 1 : 0);
    addParam(pitchColumn, body.pitch_used ?? null);
    addParam(durationColumn, body.duration_seconds ?? null);
    addParam(sentimentColumn, body.response_sentiment ?? null);
    addParam(issueColumn, body.issue_interest ?? null);
    addParam(followupNeededColumn, body.followup_needed ? 1 : 0);
    addParam(followupDateColumn, body.followup_date ?? null);

    const placeholders = insertColumns.map((_, index) => `?${index + 1}`);

    await buildStatement(
      db,
      `INSERT INTO ${callTable} (${insertColumns.join(', ')}) VALUES (${placeholders.join(', ')})`,
      params
    ).run();

    return ctx.jsonResponse(
      { ok: true, message: 'Call logged successfully', volunteer: auth.email },
      200,
      ctx.allowedOrigin
    );
  } catch (err) {
    if (err instanceof DependencyMissingError) {
      // TODO: Provision D1 table required by /call route.
      return missingTableResponse(err.table, ctx.allowedOrigin);
    }
    console.error('/call error', err);
    return ctx.jsonResponse(
      { ok: false, error: String(err?.message || err) },
      500,
      ctx.allowedOrigin
    );
  }
});

router.post('/canvass', async (request, env, ctx) => {
  let body;
  try {
    body = await readJson(request);
  } catch (err) {
    if (err instanceof BadRequestError) {
      return ctx.jsonResponse({ ok: false, error: err.message }, err.status, ctx.allowedOrigin);
    }
    throw err;
  }

  const db = getDb(env);
  if (!db) {
    // TODO: Provision D1 table canvass_activity required by /canvass route.
    return missingTableResponse('canvass_activity', ctx.allowedOrigin);
  }

  const {
    voter_id,
    action,
    result,
    note = '',
    notes = '',
    pulse_opt_in = false,
    pitch_used = null,
    location_lat = null,
    location_lng = null,
    door_status = null,
    followup_needed = false,
  } = body || {};
  if (!voter_id || !(action || result)) {
    return ctx.jsonResponse(
      { ok: false, error: 'Missing voter_id or action' },
      400,
      ctx.allowedOrigin
    );
  }

  try {
    const auth = await ensureAuth(request, env, ctx.config);
    const table = await resolveTable(env, ['canvass_activity', 'voter_canvass', 'canvass']);

    const rawOutcome = (action || result || '').toString().trim();
    const normalizedOutcome = rawOutcome.toLowerCase().replace(/\s+/g, ' ').replace(/_/g, ' ');
    const allowedOutcomeMap = new Map([
      ['contacted', 'Contacted'],
      ['contacted', 'Contacted'],
      ['not home', 'Not Home'],
      ['moved', 'Moved'],
      ['refused', 'Refused'],
      ['do not contact', 'Do Not Contact'],
    ]);
    const synonymMap = new Map([
      ['door knock', 'Contacted'],
      ['door_knock', 'Contacted'],
      ['knock', 'Contacted'],
      ['knocked', 'Contacted'],
      ['no answer', 'Not Home'],
      ['no_answer', 'Not Home'],
      ['did not answer', 'Not Home'],
      ['left message', 'Not Home'],
      ['dnc', 'Do Not Contact'],
      ['do_not_contact', 'Do Not Contact'],
    ]);

    const allowedOutcome =
      allowedOutcomeMap.get(normalizedOutcome) ||
      synonymMap.get(normalizedOutcome) ||
      allowedOutcomeMap.get(rawOutcome.toLowerCase());

    if (!allowedOutcome) {
      return ctx.jsonResponse(
        { ok: false, error: 'Unsupported canvass result', detail: rawOutcome },
        400,
        ctx.allowedOrigin
      );
    }

    const voterId = String(voter_id);
    await buildStatement(
      db,
      `INSERT INTO ${table} (
         voter_id,
         volunteer_email,
         result,
         notes,
         pulse_opt_in,
         pitch_used,
         location_lat,
         location_lng,
         door_status,
         followup_needed
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
      [
        voterId,
        auth.email || 'unknown@local',
        allowedOutcome,
        note || notes || '',
        pulse_opt_in ? 1 : 0,
        pitch_used ?? null,
        location_lat ?? null,
        location_lng ?? null,
        door_status ?? null,
        followup_needed ? 1 : 0,
      ]
    ).run();
    return ctx.jsonResponse({ ok: true, msg: 'Canvass logged' }, 200, ctx.allowedOrigin);
  } catch (err) {
    if (err instanceof DependencyMissingError) {
      // TODO: Provision D1 table required by /canvass route.
      return missingTableResponse(err.table, ctx.allowedOrigin);
    }
    console.error('/canvass error', err);
    return ctx.jsonResponse(
      { ok: false, error: String(err?.message || err) },
      500,
      ctx.allowedOrigin
    );
  }
});

router.post('/canvass/nearby', async (request, env, ctx) => {
  let body;
  try {
    body = await readJson(request);
  } catch (err) {
    if (err instanceof BadRequestError) {
      return ctx.jsonResponse({ ok: false, error: err.message }, err.status, ctx.allowedOrigin);
    }
    throw err;
  }

  const db = getDb(env);
  if (!db) {
    // TODO: Provision D1 table voters required by /canvass/nearby route.
    return missingTableResponse('voters', ctx.allowedOrigin);
  }

  const { filters = {}, house, street, range = 20, limit: requestedLimit = 20, house_number } = body || {};
  const limit = Math.min(Math.max(Number(requestedLimit) || 20, 1), 100);
  const streetFilter = String(street || '').toUpperCase().trim();
  const houseNumberFilter = house_number ? String(house_number).trim() : null;
  const countyFilter = String(filters.county || '').trim();
  const cityFilter = String(filters.city || '').trim();
  const partiesFilter = Array.isArray(filters.parties) ? filters.parties : [];

  try {
    const votersTable = await resolveTable(env, ['voters']);
    const addrTable = await resolveTable(env, ['voters_addr_norm', 'voters_addr', 'voter_addresses']);
    const phoneTable = await resolveTable(env, ['best_phone', 'best_phone_view', 'voter_phones']);

    let query = `
      SELECT v.voter_id,
             COALESCE(va.fn, '') AS first_name,
             COALESCE(va.ln, '') AS last_name,
             COALESCE(va.addr1, '') AS address,
             COALESCE(va.city, '') AS city,
             COALESCE(va.zip, '') AS zip,
             v.county,
             v.political_party AS party,
             COALESCE(bp.phone_e164, '') AS phone_e164,
             bp.confidence_code AS phone_confidence,
             COALESCE(va.house, v.house, '') AS house_district,
             COALESCE(va.senate, v.senate, '') AS senate_district
      FROM ${votersTable} v
      LEFT JOIN ${addrTable} va ON v.voter_id = va.voter_id
      LEFT JOIN ${phoneTable} bp ON v.voter_id = bp.voter_id
      WHERE 1 = 1
    `;

    const params = [];
    let paramIndex = 1;

    if (streetFilter) {
      query += ` AND UPPER(va.addr1) LIKE '%' || ?${paramIndex} || '%'`;
      params.push(streetFilter);
      paramIndex++;
    }

    // Filter by house number if provided (fast exact match)
    if (houseNumberFilter) {
      query += ` AND va.addr1 LIKE ?${paramIndex} || ' %'`;
      params.push(houseNumberFilter);
      paramIndex++;
    }

    if (countyFilter) {
      query += ` AND v.county = ?${paramIndex}`;
      params.push(countyFilter);
      paramIndex++;
    }

    if (cityFilter) {
      query += ` AND va.city = ?${paramIndex}`;
      params.push(cityFilter);
      paramIndex++;
    }

    if (partiesFilter.length > 0) {
      const placeholders = partiesFilter.map(() => `?${paramIndex++}`).join(',');
      query += ` AND v.political_party IN (${placeholders})`;
      params.push(...partiesFilter);
    }
    if (filters.district_type && filters.district) {
      const column = filters.district_type === 'senate' ? 'v.senate' : 'v.house';
      query += ` AND ${column} = ?${paramIndex++}`;
      params.push(filters.district);
    }

    if (house && range) {
      query += ` AND va.addr1 IS NOT NULL AND va.addr1 != ''`;
    }

    query += ` ORDER BY v.voter_id LIMIT ?${paramIndex}`;
    params.push(limit);

    const result = await buildStatement(db, query, params).all();

    const rows = (result.results || []).map(row => ({
      voter_id: row.voter_id,
      name: [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Unknown',
      address: row.address || '',
      city: row.city || '',
      zip: row.zip || '',
      party: row.party || '',
      phone_e164: row.phone_e164 || null,
      phone_confidence: row.phone_confidence || null,
      house_district: row.house_district || null,
      senate_district: row.senate_district || null,
    }));

    return ctx.jsonResponse(
      {
        ok: true,
        rows,
        total: rows.length,
        filters_applied: filters,
      },
      200,
      ctx.allowedOrigin
    );
  } catch (err) {
    if (err instanceof DependencyMissingError) {
      // TODO: Provision D1 table required by /canvass/nearby route.
      return missingTableResponse(err.table, ctx.allowedOrigin);
    }
    console.error('/canvass/nearby error', err);
    return ctx.jsonResponse(
      { ok: false, error: String(err?.message || err) },
      500,
      ctx.allowedOrigin
    );
  }
});

router.post('/streets', async (request, env, ctx) => {
  let body;
  try {
    body = await readJson(request);
  } catch (err) {
    if (err instanceof BadRequestError) {
      return ctx.jsonResponse({ ok: false, error: err.message }, err.status, ctx.allowedOrigin);
    }
    throw err;
  }

  const { county, city } = body || {};
  if (!county || !city) {
    return ctx.jsonResponse(
      { ok: false, error: 'county and city are required' },
      400,
      ctx.allowedOrigin
    );
  }

  const db = getDb(env);
  if (!db) {
    return missingTableResponse('streets_index', ctx.allowedOrigin);
  }

  try {
    await ensureAuth(request, env, ctx.config);
    
    // Use streets_index for fast, clean street names
    const result = await db.prepare(`
      SELECT 
        si.street_canonical AS street_name,
        COUNT(*) AS street_count
      FROM streets_index si
      JOIN wy_city_county cc ON si.city_county_id = cc.id
      WHERE cc.county_norm = UPPER(?1)
        AND cc.city_norm = UPPER(?2)
      GROUP BY si.street_canonical
      ORDER BY si.street_canonical
    `).bind(county, city).all();

    const streets = (result.results || []).map(row => ({
      name: row.street_name,
      count: row.street_count,
    }));

    return ctx.jsonResponse(
      { ok: true, county, city, streets, total: streets.length },
      200,
      ctx.allowedOrigin,
      { 'Cache-Control': 'max-age=3600' }
    );
  } catch (err) {
    console.error('/streets error', err);
    return ctx.jsonResponse(
      { ok: false, error: String(err?.message || err) },
      500,
      ctx.allowedOrigin
    );
  }
});

router.post('/houses', async (request, env, ctx) => {
  let body;
  try {
    body = await readJson(request);
  } catch (err) {
    if (err instanceof BadRequestError) {
      return ctx.jsonResponse({ ok: false, error: err.message }, err.status, ctx.allowedOrigin);
    }
    throw err;
  }

  const { county, city, street } = body || {};
  if (!county || !city || !street) {
    return ctx.jsonResponse(
      { ok: false, error: 'county, city, and street are required' },
      400,
      ctx.allowedOrigin
    );
  }

  const db = getDb(env);
  if (!db) {
    return missingTableResponse('voters_addr_norm', ctx.allowedOrigin);
  }

  try {
    await ensureAuth(request, env, ctx.config);
    
    // Get house numbers from voters_addr_norm using city_county_id for speed
    const result = await db.prepare(`
      SELECT DISTINCT
        TRIM(SUBSTR(addr1, 1, INSTR(addr1, ' ')-1)) AS house_number,
        COUNT(*) AS voter_count
      FROM voters_addr_norm va
      JOIN wy_city_county cc ON va.city_county_id = cc.id
      WHERE cc.county_norm = UPPER(?1)
        AND cc.city_norm = UPPER(?2)
        AND UPPER(TRIM(SUBSTR(va.addr1, INSTR(va.addr1, ' ')+1))) = UPPER(?3)
        AND va.addr1 IS NOT NULL
        AND INSTR(va.addr1, ' ') > 0
      GROUP BY house_number
      ORDER BY CAST(house_number AS INTEGER), house_number
    `).bind(county, city, street).all();

    const houses = (result.results || []).map(row => ({
      house_number: row.house_number,
      voter_count: row.voter_count,
    }));

    return ctx.jsonResponse(
      { ok: true, county, city, street, houses, total: houses.length },
      200,
      ctx.allowedOrigin,
      { 'Cache-Control': 'max-age=3600' }
    );
  } catch (err) {
    console.error('/houses error', err);
    return ctx.jsonResponse(
      { ok: false, error: String(err?.message || err) },
      500,
      ctx.allowedOrigin
    );
  }
});

router.post('/contact', async (request, env, ctx) => {
  let body;
  try {
    body = await readJson(request);
  } catch (err) {
    if (err instanceof BadRequestError) {
      return ctx.jsonResponse({ ok: false, error: err.message }, err.status, ctx.allowedOrigin);
    }
    throw err;
  }

  const { voter_id, outcome, status, notes, comments } = body || {};
  if (!voter_id || !(outcome || status)) {
    return ctx.jsonResponse(
      { ok: false, error: 'Missing required parameters: voter_id, outcome' },
      400,
      ctx.allowedOrigin
    );
  }

  const db = getDb(env);
  if (!db) {
    // TODO: Provision D1 table voter_contact required by /contact route.
    return missingTableResponse('voter_contact', ctx.allowedOrigin);
  }

  try {
    const auth = await ensureAuth(request, env, ctx.config);
    const contactTable = await resolveTable(env, ['voter_contacts', 'voter_contact']);
    const columns = await getTableColumns(env, contactTable);

    const insertColumns = [];
    const paramValues = [];

    const addColumn = (name, value) => {
      insertColumns.push(name);
      paramValues.push(value);
    };

    addColumn('voter_id', voter_id);

    const methodColumn = columns.includes('contact_method')
      ? 'contact_method'
      : columns.includes('method')
        ? 'method'
        : null;
    if (methodColumn) {
      const normalizedMethod = (body.contact_method || body.method || 'door').toString().toLowerCase();
      addColumn(methodColumn, normalizedMethod);
    }

    const outcomeColumn = columns.includes('outcome')
      ? 'outcome'
      : columns.includes('status')
        ? 'status'
        : null;
    if (outcomeColumn) addColumn(outcomeColumn, outcome || status);

    const notesColumn = columns.includes('comments')
      ? 'comments'
      : columns.includes('notes')
        ? 'notes'
        : null;
    if (notesColumn) addColumn(notesColumn, notes ?? comments ?? '');

    const volunteerColumn = columns.includes('volunteer_email')
      ? 'volunteer_email'
      : columns.includes('volunteer_id')
        ? 'volunteer_id'
        : null;
    if (volunteerColumn) addColumn(volunteerColumn, auth.email || 'unknown@local');

    // Handle additional call-specific fields if columns exist
    const callFields = {
      'ok_callback': body.ok_callback,
      'requested_info': body.requested_info,
      'dnc': body.dnc,
      'best_day': body.best_day,
      'best_time_window': body.best_time_window,
      'optin_sms': body.optin_sms,
      'optin_email': body.optin_email,
      'email': body.email,
      'wants_volunteer': body.wants_volunteer,
      'share_insights_ok': body.share_insights_ok,
      'for_term_limits': body.for_term_limits,
      'issue_public_lands': body.issue_public_lands
    };
    
    for (const [fieldName, fieldValue] of Object.entries(callFields)) {
      if (columns.includes(fieldName) && fieldValue !== undefined && fieldValue !== null) {
        addColumn(fieldName, fieldValue);
      }
    }

    const timestampColumn = columns.includes('ts')
      ? 'ts'
      : columns.includes('created_at')
        ? 'created_at'
        : null;

    const placeholders = insertColumns.map((_, index) => `?${index + 1}`);
    if (timestampColumn) {
      insertColumns.push(timestampColumn);
      placeholders.push("datetime('now')");
    }

    const sql = `INSERT INTO ${contactTable} (${insertColumns.join(', ')}) VALUES (${placeholders.join(', ')})`;
    await buildStatement(db, sql, paramValues).run();
    return ctx.jsonResponse({ ok: true, msg: 'Contact logged successfully' }, 200, ctx.allowedOrigin);
  } catch (err) {
    if (err instanceof DependencyMissingError) {
      // TODO: Provision D1 table required by /contact route.
      return missingTableResponse(err.table, ctx.allowedOrigin);
    }
    const message = String(err?.message || err).toLowerCase();
    if (message.includes('no such column') || message.includes('no such table')) {
      // TODO: Provision D1 table voter_contact with expected columns.
      return missingTableResponse('voter_contact', ctx.allowedOrigin);
    }
    console.error('/contact error', err);
    return ctx.jsonResponse(
      { ok: false, error: String(err?.message || err) },
      500,
      ctx.allowedOrigin
    );
  }
});

router.post('/contact-staging', async (request, env, ctx) => {
  let body;
  try {
    body = await readJson(request);
  } catch (err) {
    if (err instanceof BadRequestError) {
      return ctx.jsonResponse({ ok: false, error: err.message }, err.status, ctx.allowedOrigin);
    }
    throw err;
  }

  const db = getDb(env);
  const stagingTable = db
    ? await resolveTable(env, ['voter_contact_staging', 'voter_contact_st']).catch(() => null)
    : null;

  if (!db || !stagingTable) {
    const detail = stagingTable ? 'voter_contact_staging' : 'staging_table_missing';
    return ctx.jsonResponse(
      { ok: false, error: 'dependency_missing', detail },
      503,
      ctx.allowedOrigin
    );
  }

  const requiredFields = ['county', 'city', 'firstName', 'lastName'];
  const missing = requiredFields.filter(field => !body || !body[field]);
  if (missing.length) {
    return ctx.jsonResponse(
      { ok: false, error: `Missing required fields: ${missing.join(', ')}` },
      400,
      ctx.allowedOrigin
    );
  }

  try {
    const auth = await ensureAuth(request, env, ctx.config);
    const payload = {
      ...body,
      submitted_by: auth.email || 'unknown@local',
      vol_email: auth.email || 'unknown@local',
      volunteer: auth.email || 'unknown@local',
      received_at: new Date().toISOString(),
    };
    const result = await buildStatement(
      db,
      `INSERT INTO ${stagingTable} (json) VALUES (?1)`,
      [JSON.stringify(payload)]
    ).run();
    const stagingId = result?.meta?.last_row_id ?? null;
    const tempVoterId = body?.voter_id && String(body.voter_id).trim()
      ? String(body.voter_id).trim()
      : stagingId
        ? `tmp${String(stagingId).padStart(5, '0')}`
        : `tmp${Date.now()}`;
    if (stagingId) {
      await buildStatement(
        db,
        `UPDATE ${stagingTable} SET voter_id = ?1 WHERE id = ?2`,
        [tempVoterId, stagingId]
      ).run();
    }
    return ctx.jsonResponse(
      {
        ok: true,
        msg: 'Contact submitted for verification',
        staging_id: stagingId,
        temp_voter_id: tempVoterId,
      },
      200,
      ctx.allowedOrigin
    );
  } catch (err) {
    const message = String(err?.message || err).toLowerCase();
    if (message.includes('no such table')) {
      return ctx.jsonResponse(
        { ok: false, error: 'dependency_missing', detail: 'voter_contact_staging' },
        503,
        ctx.allowedOrigin
      );
    }
    console.error('/contact-staging error', err);
    return ctx.jsonResponse(
      { ok: false, error: String(err?.message || err) },
      500,
      ctx.allowedOrigin
    );
  }
});

router.get('/contact/status', async (request, env, ctx) => {
  const voterIds = parseVoterIds(new URL(request.url).searchParams.get('voter_ids'));
  if (!voterIds.length) {
    return ctx.jsonResponse(
      { ok: false, error: 'voter_ids parameter required (comma-separated)' },
      400,
      ctx.allowedOrigin
    );
  }

  const db = getDb(env);
  if (!db) {
    // TODO: Provision D1 table voter_contact required by /contact/status route.
    return missingTableResponse('voter_contact', ctx.allowedOrigin);
  }

  try {
    const contactTable = await resolveTable(env, ['voter_contacts', 'voter_contact']);
    const columns = await getTableColumns(env, contactTable);
    const outcomeColumn = columns.includes('outcome') ? 'outcome' : columns.includes('status') ? 'status' : null;
    const methodColumn = columns.includes('contact_method') ? 'contact_method' : columns.includes('method') ? 'method' : null;
    const timestampColumn = columns.includes('ts') ? 'ts' : columns.includes('created_at') ? 'created_at' : null;
    const placeholders = voterIds.map((_, index) => `?${index + 1}`).join(',');
    let selectClause = 'voter_id';
    if (outcomeColumn) selectClause += `, ${outcomeColumn} AS outcome`;
    if (methodColumn) selectClause += `, ${methodColumn} AS contact_method`;
    if (timestampColumn) selectClause += `, ${timestampColumn} AS timestamp`;

    let query = `SELECT ${selectClause} FROM ${contactTable} WHERE voter_id IN (${placeholders})`;
    if (timestampColumn) {
      query += ` ORDER BY ${timestampColumn} DESC`;
    }

    const result = await buildStatement(db, query, voterIds).all();
    return ctx.jsonResponse({ ok: true, rows: result.results ?? [] }, 200, ctx.allowedOrigin);
  } catch (err) {
    if (err instanceof DependencyMissingError) {
      // TODO: Provision D1 table required by /contact/status route.
      return missingTableResponse(err.table, ctx.allowedOrigin);
    }
    const message = String(err?.message || err).toLowerCase();
    if (message.includes('no such column') || message.includes('no such table')) {
      // TODO: Provision D1 table voter_contact with expected columns.
      return missingTableResponse('voter_contact', ctx.allowedOrigin);
    }
    console.error('/contact/status error', err);
    return ctx.jsonResponse(
      { ok: false, error: String(err?.message || err) },
      500,
      ctx.allowedOrigin
    );
  }
});

router.post('/pulse', async (request, env, ctx) => {
  let body;
  try {
    body = await readJson(request);
  } catch (err) {
    if (err instanceof BadRequestError) {
      return ctx.jsonResponse({ ok: false, error: err.message }, err.status, ctx.allowedOrigin);
    }
    throw err;
  }

  const { voter_id, contact_method, consent_source } = body || {};
  if (!voter_id || !contact_method || !consent_source) {
    return ctx.jsonResponse(
      { ok: false, error: 'Missing required parameters: voter_id, contact_method, consent_source' },
      400,
      ctx.allowedOrigin
    );
  }

  const db = getDb(env);
  if (!db) {
    // TODO: Provision D1 table pulse_optins required by /pulse route.
    return missingTableResponse('pulse_optins', ctx.allowedOrigin);
  }

  let volunteerEmail = null;
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    volunteerEmail = auth.email || null;
  } catch {
    volunteerEmail = null;
  }

  try {
    const table = await resolveTable(env, ['pulse_optins', 'pulse']);
    const normalizedMethod = String(contact_method).toLowerCase();
    let normalizedSource = String(consent_source).toLowerCase();
    const allowedSources = new Set(['call', 'canvass', 'webform']);
    if (!allowedSources.has(normalizedSource)) {
      normalizedSource = 'webform';
    }
    await buildStatement(
      db,
      `INSERT INTO ${table} (voter_id, contact_method, consent_source, volunteer_email)
       VALUES (?1, ?2, ?3, ?4)`,
      [String(voter_id), normalizedMethod, normalizedSource, volunteerEmail]
    ).run();
    return ctx.jsonResponse(
      {
        ok: true,
        msg: 'Opt-in recorded',
        voter_id: String(voter_id),
        contact_method: normalizedMethod,
        consent_source: normalizedSource,
      },
      200,
      ctx.allowedOrigin
    );
  } catch (err) {
    if (err instanceof DependencyMissingError) {
      // TODO: Provision D1 table required by /pulse route.
      return missingTableResponse(err.table, ctx.allowedOrigin);
    }
    const message = String(err?.message || err).toLowerCase();
    if (message.includes('no such column') || message.includes('no such table')) {
      // TODO: Provision D1 table pulse_optins with expected columns.
      return missingTableResponse('pulse_optins', ctx.allowedOrigin);
    }
    console.error('/pulse error', err);
    return ctx.jsonResponse(
      { ok: false, error: String(err?.message || err) },
      500,
      ctx.allowedOrigin
    );
  }
});

// ============================================================================
// ADMIN ROUTES
// ============================================================================

router.get('/admin/whoami', async (request, env, ctx) => {
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    const userIsAdmin = isAdmin(auth.email, env);
    
    return ctx.jsonResponse(
      {
        ok: true,
        email: auth.email,
        isAdmin: userIsAdmin,
        environment: ctx.config.environment,
      },
      200,
      ctx.allowedOrigin
    );
  } catch (err) {
    const status = err?.status === 401 ? 401 : 500;
    return ctx.jsonResponse(
      { ok: false, error: String(err?.message || err) },
      status,
      ctx.allowedOrigin
    );
  }
});

router.get('/admin/stats', async (request, env, ctx) => {
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    requireAdmin(auth.email, env);
    
    const db = getDb(env);
    if (!db) {
      return missingTableResponse('voters', ctx.allowedOrigin);
    }
    
    // Get voter contact statistics
    const contactTable = await resolveTable(env, ['voter_contacts', 'voter_contact']);
    const votersTable = await resolveTable(env, ['voters']);
    const columns = await getTableColumns(env, contactTable);
    
    // Determine which column name to use for method
    const methodColumn = columns.includes('method') 
      ? 'method' 
      : columns.includes('contact_method') 
        ? 'contact_method' 
        : null;
    
    const totalVoters = await buildStatement(db, `SELECT COUNT(*) as count FROM ${votersTable}`).first();
    const totalContacts = await buildStatement(db, `SELECT COUNT(*) as count FROM ${contactTable}`).first();
    
    // Get contacts by method (if column exists)
    let contactsByMethod = { results: [] };
    if (methodColumn) {
      contactsByMethod = await buildStatement(db, `
        SELECT 
          ${methodColumn} as method,
          COUNT(*) as count
        FROM ${contactTable}
        WHERE ${methodColumn} IS NOT NULL
        GROUP BY ${methodColumn}
      `).all();
    }
    
    // Get contacts by outcome
    const contactsByOutcome = await buildStatement(db, `
      SELECT 
        outcome,
        COUNT(*) as count
      FROM ${contactTable}
      WHERE outcome IS NOT NULL
      GROUP BY outcome
      ORDER BY count DESC
    `).all();
    
    return ctx.jsonResponse(
      {
        ok: true,
        stats: {
          total_voters: totalVoters?.count || 0,
          total_contacts: totalContacts?.count || 0,
          by_method: contactsByMethod?.results || [],
          by_outcome: contactsByOutcome?.results || [],
        },
        admin: auth.email,
      },
      200,
      ctx.allowedOrigin
    );
  } catch (err) {
    if (err?.status === 403) {
      return ctx.jsonResponse(
        { ok: false, error: 'Admin access required' },
        403,
        ctx.allowedOrigin
      );
    }
    console.error('/admin/stats error', err);
    return ctx.jsonResponse(
      { ok: false, error: String(err?.message || err) },
      500,
      ctx.allowedOrigin
    );
  }
});

router.get('/admin/contacts', async (request, env, ctx) => {
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    requireAdmin(auth.email, env);
    
    const db = getDb(env);
    if (!db) {
      return missingTableResponse('voter_contacts', ctx.allowedOrigin);
    }
    
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 500);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const reviewedFilter = url.searchParams.get('reviewed'); // 'true', 'false', or null (all)
    
    const contactTable = await resolveTable(env, ['voter_contacts', 'voter_contact']);
    const columns = await getTableColumns(env, contactTable);
    
    // Determine column names
    const methodColumn = columns.includes('method') ? 'method' : 'contact_method';
    const volunteerColumn = columns.includes('volunteer_email') ? 'volunteer_email' : 'volunteer_id';
    const timestampColumn = columns.includes('created_at') ? 'created_at' : 'ts';
    const commentsColumn = columns.includes('comments') ? 'comments' : 'notes';
    const reviewedColumn = columns.includes('reviewed') ? 'reviewed' : null;
    
    // Build query with optional reviewed filter
    let whereClause = '1 = 1';
    const params = [];
    let paramIndex = 1;
    
    if (reviewedFilter === 'true' && reviewedColumn) {
      whereClause += ` AND ${reviewedColumn} = 1`;
    } else if (reviewedFilter === 'false' && reviewedColumn) {
      whereClause += ` AND (${reviewedColumn} = 0 OR ${reviewedColumn} IS NULL)`;
    }
    
    // Get contacts
    const selectColumns = `
        id,
        voter_id,
        ${methodColumn} as method,
        outcome,
        ${volunteerColumn} as volunteer,
        ${commentsColumn} as comments,
        ${reviewedColumn ? `${reviewedColumn} as reviewed,` : '0 as reviewed,'}
        ${timestampColumn} as created_at
    `;
    
    const contacts = await buildStatement(db, `
      SELECT ${selectColumns}
      FROM ${contactTable}
      WHERE ${whereClause}
      ORDER BY ${timestampColumn} DESC
      LIMIT ?${paramIndex++} OFFSET ?${paramIndex++}
    `, [limit, offset]).all();
    
    // Get total count
    const total = await buildStatement(db, `
      SELECT COUNT(*) as count FROM ${contactTable}
      WHERE ${whereClause}
    `).first();
    
    return ctx.jsonResponse(
      {
        ok: true,
        contacts: contacts?.results || [],
        total: total?.count || 0,
        limit,
        offset,
        has_reviewed_column: !!reviewedColumn,
      },
      200,
      ctx.allowedOrigin
    );
  } catch (err) {
    if (err?.status === 403) {
      return ctx.jsonResponse(
        { ok: false, error: 'Admin access required' },
        403,
        ctx.allowedOrigin
      );
    }
    console.error('/admin/contacts error', err);
    return ctx.jsonResponse(
      { ok: false, error: String(err?.message || err) },
      500,
      ctx.allowedOrigin
    );
  }
});

router.get('/admin/contacts/:id', async (request, env, ctx) => {
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    requireAdmin(auth.email, env);
    
    const db = getDb(env);
    if (!db) {
      return missingTableResponse('voter_contacts', ctx.allowedOrigin);
    }
    
    const url = new URL(request.url);
    const id = url.pathname.split('/').pop();
    
    const contactTable = await resolveTable(env, ['voter_contacts', 'voter_contact']);
    const columns = await getTableColumns(env, contactTable);
    
    // Get all columns for full record
    const contact = await buildStatement(db, `
      SELECT * FROM ${contactTable} WHERE id = ?1
    `, [id]).first();
    
    if (!contact) {
      return ctx.jsonResponse(
        { ok: false, error: 'Contact not found' },
        404,
        ctx.allowedOrigin
      );
    }
    
    return ctx.jsonResponse(
      {
        ok: true,
        contact,
        available_columns: columns,
      },
      200,
      ctx.allowedOrigin
    );
  } catch (err) {
    if (err?.status === 403) {
      return ctx.jsonResponse(
        { ok: false, error: 'Admin access required' },
        403,
        ctx.allowedOrigin
      );
    }
    console.error('/admin/contacts/:id error', err);
    return ctx.jsonResponse(
      { ok: false, error: String(err?.message || err) },
      500,
      ctx.allowedOrigin
    );
  }
});

router.put('/admin/contacts/:id', async (request, env, ctx) => {
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    requireAdmin(auth.email, env);
    
    const db = getDb(env);
    if (!db) {
      return missingTableResponse('voter_contacts', ctx.allowedOrigin);
    }
    
    const url = new URL(request.url);
    const id = url.pathname.split('/').pop();
    
    let body;
    try {
      body = await readJson(request);
    } catch (err) {
      if (err instanceof BadRequestError) {
        return ctx.jsonResponse({ ok: false, error: err.message }, err.status, ctx.allowedOrigin);
      }
      throw err;
    }
    
    const contactTable = await resolveTable(env, ['voter_contacts', 'voter_contact']);
    const columns = await getTableColumns(env, contactTable);
    
    // Build UPDATE statement dynamically
    const updateFields = [];
    const params = [];
    let paramIndex = 1;
    
    // Allowed fields to update
    const allowedFields = ['outcome', 'comments', 'notes', 'method', 'contact_method', 'reviewed', 
                          'ok_callback', 'requested_info', 'dnc', 'best_day', 'best_time_window',
                          'optin_sms', 'optin_email', 'email', 'wants_volunteer', 'share_insights_ok',
                          'for_term_limits', 'issue_public_lands'];
    
    for (const field of allowedFields) {
      if (body[field] !== undefined && columns.includes(field)) {
        updateFields.push(`${field} = ?${paramIndex++}`);
        params.push(body[field]);
      }
    }
    
    if (updateFields.length === 0) {
      return ctx.jsonResponse(
        { ok: false, error: 'No valid fields to update' },
        400,
        ctx.allowedOrigin
      );
    }
    
    params.push(id);
    
    await buildStatement(db, `
      UPDATE ${contactTable}
      SET ${updateFields.join(', ')}
      WHERE id = ?${paramIndex}
    `, params).run();
    
    return ctx.jsonResponse(
      { ok: true, message: 'Contact updated', id },
      200,
      ctx.allowedOrigin
    );
  } catch (err) {
    if (err?.status === 403) {
      return ctx.jsonResponse(
        { ok: false, error: 'Admin access required' },
        403,
        ctx.allowedOrigin
      );
    }
    console.error('/admin/contacts/:id PUT error', err);
    return ctx.jsonResponse(
      { ok: false, error: String(err?.message || err) },
      500,
      ctx.allowedOrigin
    );
  }
});

router.delete('/admin/contacts/:id', async (request, env, ctx) => {
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    requireAdmin(auth.email, env);
    
    const db = getDb(env);
    if (!db) {
      return missingTableResponse('voter_contacts', ctx.allowedOrigin);
    }
    
    const url = new URL(request.url);
    const id = url.pathname.split('/').pop();
    
    const contactTable = await resolveTable(env, ['voter_contacts', 'voter_contact']);
    
    await buildStatement(db, `
      DELETE FROM ${contactTable} WHERE id = ?1
    `, [id]).run();
    
    return ctx.jsonResponse(
      { ok: true, message: 'Contact deleted', id },
      200,
      ctx.allowedOrigin
    );
  } catch (err) {
    if (err?.status === 403) {
      return ctx.jsonResponse(
        { ok: false, error: 'Admin access required' },
        403,
        ctx.allowedOrigin
      );
    }
    console.error('/admin/contacts/:id DELETE error', err);
    return ctx.jsonResponse(
      { ok: false, error: String(err?.message || err) },
      500,
      ctx.allowedOrigin
    );
  }
});
