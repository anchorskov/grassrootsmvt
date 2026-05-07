// Path: worker/src/index.js
import { router } from './router.js';
import { getEnvironmentConfig } from './utils/env.js';
import { pickAllowedOrigin, preflightResponse, parseAllowedOrigins } from './utils/cors.js';
import { requireAuth, requireAdmin, isAdmin } from './auth.js';
import { searchSimilarNames } from './api/contact-form.js';

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const tableCache = new Map();
const tableColumnsCache = new Map();
const DEFAULT_ICEBREAKER =
  "Hi, I'm a volunteer with Grassroots MVT. Do you have a minute to chat about the campaign?";

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

async function resolveTableOptional(env, candidates) {
  try {
    return await resolveTable(env, candidates);
  } catch (err) {
    if (err instanceof DependencyMissingError) return null;
    throw err;
  }
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

function normalizeTextValue(value) {
  const normalized = (value ?? '')
    .toString()
    .trim()
    .toUpperCase();
  if (!normalized) return '';
  if (normalized === 'NULL' || normalized === 'UNDEFINED' || normalized === 'NONE' || normalized === 'ANY' || normalized === 'ALL') {
    return '';
  }
  return normalized;
}

function normalizeDistrictCode(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (!Number.isNaN(num)) {
    return String(Math.abs(num)).padStart(2, '0');
  }
  return trimmed.toUpperCase();
}

function buildDistrictNormalizationExpr(column) {
  return `CASE
    WHEN TRIM(${column}) GLOB '[0-9]*' AND TRIM(${column}) <> ''
      THEN printf('%02d', CAST(TRIM(${column}) AS INTEGER))
    ELSE UPPER(TRIM(${column}))
  END`;
}

async function getLegislatorByDistrict(db, table, chamber, district) {
  if (!table || !chamber || !district) return null;
  const stmt = db.prepare(`
    SELECT
      name,
      chamber,
      district,
      party,
      phone,
      email,
      COALESCE(campaign_website, '') AS campaign_website,
      COALESCE(official_profile_url, '') AS official_profile_url
    FROM ${table}
    WHERE chamber = ?1
      AND UPPER(TRIM(district)) = UPPER(TRIM(?2))
    LIMIT 1
  `);
  const result = await stmt.bind(chamber, district).first();
  return result || null;
}

async function getCityCountyIdsForDistrict(env, db, districtType, districtCode, districtCity = null) {
  if (!districtType || !districtCode) return [];
  const coverageTable = await resolveTableOptional(env, ['district_coverage']);
  if (coverageTable) {
    const params = [districtType, districtCode];
    let cityClause = '';
    if (districtCity) {
      cityClause = ` AND dc.city = ?${params.length + 1}`;
      params.push(districtCity);
    }
    const coverageResult = await buildStatement(
      db,
      `SELECT DISTINCT cc.id
       FROM ${coverageTable} dc
       JOIN wy_city_county cc
         ON cc.county = dc.county
        AND (dc.city = '' OR cc.city = dc.city)
       WHERE dc.district_type = ?1 AND dc.district_code = ?2${cityClause}`,
      params
    ).all();
    const rows = coverageResult.results || [];
    if (rows.length) {
      return rows.map(row => row.id);
    }
  }

  const votersTable = await resolveTable(env, ['voters']);
  const addrTable = await resolveTable(env, ['voters_addr_norm', 'voters_addr', 'voter_addresses']);
  const districtColumn = districtType === 'senate' ? 'va.senate' : 'va.house';
  const normalizedExpr = buildDistrictNormalizationExpr(districtColumn);
  const params = [districtCode];
  let cityClause = '';
  if (districtCity) {
    cityClause = ` AND UPPER(TRIM(COALESCE(va.city, ''))) = ?${params.length + 1}`;
    params.push(districtCity);
  }
  const fallbackResult = await buildStatement(
    db,
    `SELECT DISTINCT cc.id
     FROM ${addrTable} va
     JOIN ${votersTable} v ON v.voter_id = va.voter_id
     JOIN wy_city_county cc
       ON cc.county = UPPER(TRIM(v.county))
      AND cc.city = UPPER(TRIM(COALESCE(va.city, '')))
     WHERE ${normalizedExpr} = ?1${cityClause}`,
    params
  ).all();
  return (fallbackResult.results || []).map(row => row.id);
}

async function buildRegionFilterClause(env, db, filters = {}) {
  const districtTypeRaw = filters.district_type || filters.districtType || null;
  const normalizedDistrictType = typeof districtTypeRaw === 'string'
    ? districtTypeRaw.trim().toLowerCase()
    : null;
  const districtCode = normalizeDistrictCode(filters.district || filters.district_code);
  const districtCityValue = normalizeTextValue(filters.district_city);
  const districtCity = districtCityValue ? districtCityValue : null;
  const validDistrictType = normalizedDistrictType === 'senate' || normalizedDistrictType === 'house'
    ? normalizedDistrictType
    : null;

  if (validDistrictType && districtCode) {
    const ids = await getCityCountyIdsForDistrict(env, db, validDistrictType, districtCode, districtCity);
    if (!ids.length) {
      return { clause: '1 = 0', params: [] };
    }
    const placeholders = ids.map(() => '?').join(',');
    return { clause: `cc.id IN (${placeholders})`, params: ids };
  }

  const county = normalizeTextValue(filters.county);
  const city = normalizeTextValue(filters.city);
  if (county && city) {
    return {
      clause: 'cc.county = ? AND cc.city = ?',
      params: [county, city],
    };
  }
  if (county && !city) {
    return {
      clause: 'cc.county = ?',
      params: [county],
    };
  }
  if (city && !county) {
    return {
      clause: 'cc.city = ?',
      params: [city],
    };
  }
  throw new BadRequestError('county/city or district filters required');
}

function sanitizeReturnTarget(rawTarget, baseUrl) {
  if (!rawTarget) return '/';
  try {
    const candidate = new URL(rawTarget, baseUrl.origin);
    if (candidate.origin !== baseUrl.origin) {
      return '/';
    }
    const path = candidate.pathname || '/';
    const search = candidate.search || '';
    const hash = candidate.hash || '';
    return `${path}${search}${hash}` || '/';
  } catch {
    if (typeof rawTarget === 'string' && rawTarget.startsWith('/')) {
      return rawTarget;
    }
  }
  return '/';
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

router.get('/volunteer/me', async (request, env, ctx) => {
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    const email = (auth.email || '').toLowerCase();
    const db = getDb(env);
    let volunteer = null;

    if (db) {
      try {
        const volunteerTable = await resolveTableOptional(env, ['volunteers']);
        if (volunteerTable) {
          volunteer = await fetchVolunteerById(env, db, volunteerTable, email);
        }
      } catch (err) {
        const message = String(err?.message || '').toLowerCase();
        if (!message.includes('no such table')) throw err;
      }
    }

    const displayName = deriveVolunteerDisplayName(volunteer, email);
    return ctx.jsonResponse(
      { ok: true, email: auth.email, volunteer, display_name: displayName, is_admin: isAdmin(auth.email, env) },
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

router.get('/volunteers/options', async (request, env, ctx) => {
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    if (!auth?.email) {
      return ctx.jsonResponse({ ok: false, error: 'Unauthenticated' }, 401, ctx.allowedOrigin);
    }
    if (!isAdmin(auth.email, env)) {
      return ctx.jsonResponse({ ok: false, error: 'Admin access required' }, 403, ctx.allowedOrigin);
    }

    const db = getDb(env);
    if (!db) {
      return missingTableResponse('volunteers', ctx.allowedOrigin);
    }

    const volunteerTable = await resolveTable(env, ['volunteers']);
    const columns = await getTableColumns(env, volunteerTable);
    const hasState = columns.includes('state');
    const hasCell = columns.includes('cell_phone');
    const hasCity = columns.includes('city');
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '500'), 1000);
    const onlyActive = url.searchParams.get('active') === 'true';

    const rows = await buildStatement(
      db,
      `
        SELECT id, name, first_name, last_name, is_active${hasState ? ', state' : ', NULL as state'}${hasCell ? ', cell_phone' : ', NULL as cell_phone'}${hasCity ? ', city' : ', NULL as city'}
        FROM ${volunteerTable}
        WHERE 1 = 1 ${onlyActive ? 'AND is_active = 1' : ''}
        ORDER BY is_active DESC, COALESCE(last_name, name), COALESCE(first_name, id)
        LIMIT ?1
      `,
      [limit]
    ).all();

    return ctx.jsonResponse(
      { ok: true, volunteers: rows.results || [] },
      200,
      ctx.allowedOrigin
    );
  } catch (err) {
    if (err instanceof DependencyMissingError) {
      return missingTableResponse(err.table, ctx.allowedOrigin);
    }
    const status = err?.status === 401 ? 401 : 500;
    console.error('/volunteers/options error', err);
    return ctx.jsonResponse(
      { ok: false, error: String(err?.message || err) },
      status,
      ctx.allowedOrigin
    );
  }
});

router.get('/auth/logout', async (request, env, ctx) => {
  const url = new URL(request.url);
  const rawTarget = url.searchParams.get('return_to') || url.searchParams.get('to') || '/';
  const safeRelative = sanitizeReturnTarget(rawTarget, url);
  const absoluteTarget = new URL(safeRelative, url.origin).toString();

  if (ctx.config.isLocal) {
    return Response.redirect(absoluteTarget, 302);
  }

  const logoutUrl = new URL('/cdn-cgi/access/logout', url.origin);
  logoutUrl.searchParams.set('return_to', absoluteTarget);
  return Response.redirect(logoutUrl.toString(), 302);
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
        const districtCode = normalizeDistrictCode(houseDistrict || senateDistrict);
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
    console.log('[/call] Auth check passed:', { email: auth.email, isLocal: auth.isLocal });
  } catch (err) {
    console.error('[/call] Auth failed:', { status: err?.status, message: String(err?.message || err) });
    const status = err?.status === 401 ? 401 : 500;
    return ctx.jsonResponse({ ok: false, error: String(err?.message || err) }, status, ctx.allowedOrigin);
  }

  try {
    if (body.filters !== undefined || body.exclude_ids !== undefined) {
      const votersTable = await resolveTable(env, ['voters']);
      const addrTable = await resolveTable(env, ['voters_addr_norm', 'voters_addr', 'voter_addresses']);
      const phoneTable = await resolveTableOptional(env, ['best_phone', 'voter_phones', 'v_best_phone', 'best_phone_view']);
      const phoneJoinClause = phoneTable ? `LEFT JOIN ${phoneTable} bp ON v.voter_id = bp.voter_id` : '-- no phone table available';
      const phoneValueExpr = phoneTable ? "NULLIF(bp.phone_e164, '')" : 'NULL';
      const phoneValueSelectExpr = phoneTable ? `COALESCE(${phoneValueExpr}, '')` : `''`;
      const contactsTable = await resolveTable(env, ['voter_contacts', 'voter_contact']);
      const filters = body.filters || {};
      const excludeIds = Array.isArray(body.exclude_ids) ? body.exclude_ids : [];
      const excludeContacted = body.exclude_contacted !== false; // Default true

      let sql = `
        SELECT v.voter_id,
               COALESCE(va.fn, '') AS first_name,
               COALESCE(va.ln, '') AS last_name,
               ${phoneValueSelectExpr} AS phone_1,
               '' AS phone_2,
               v.county,
               COALESCE(va.city, '') AS city,
               v.political_party,
               COALESCE(va.house, v.house, '') AS house_district,
               COALESCE(va.senate, v.senate, '') AS senate_district
        FROM ${votersTable} v
        LEFT JOIN ${addrTable} va ON v.voter_id = va.voter_id
        ${phoneJoinClause}
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
        if (phoneTable) {
          sql += ` AND ${phoneValueExpr} IS NOT NULL`;
        } else {
          return ctx.jsonResponse(
            { ok: true, empty: true, message: 'No phone data available for this environment.' },
            200,
            ctx.allowedOrigin
          );
        }
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

    // Opportunistically geocode voter from canvass GPS contact.
    // Refreshes coordinates if > 30 days old; never blocks the canvass response.
    if (Number.isFinite(Number(location_lat)) && Number.isFinite(Number(location_lng))) {
      try {
        const addrTable = await resolveTableOptional(env, ['voters_addr_norm']);
        if (addrTable) {
          await buildStatement(
            db,
            `UPDATE ${addrTable}
             SET lat = ?1, lng = ?2, geocoded_at = datetime('now')
             WHERE voter_id = ?3
               AND (lat IS NULL OR geocoded_at < datetime('now', '-30 days'))`,
            [Number(location_lat), Number(location_lng), voterId]
          ).run();
        }
      } catch {
        // Non-critical — don't fail the canvass log if coordinate write fails
      }
    }

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

  const {
    filters = {},
    house,
    street,
    range = 20,
    limit: requestedLimit = 20,
    house_number,
    streets_index_id,
  } = body || {};
  const limit = Math.min(Math.max(Number(requestedLimit) || 20, 1), 100);
  const streetFilter = String(street || '').toUpperCase().trim();
  const requestedHouseNumber = house_number ?? house ?? null;
  const houseNumberFilter = requestedHouseNumber ? String(requestedHouseNumber).trim() : null;
  const numericHouse = houseNumberFilter && !Number.isNaN(Number(houseNumberFilter)) ? Number(houseNumberFilter) : null;
  const countyFilter = normalizeTextValue(filters.county);
  const cityFilter = normalizeTextValue(filters.city);
  const voterIdFilter = filters.voter_id ? String(filters.voter_id).trim() : null;
  const districtCityFilter = normalizeTextValue(filters.district_city);
  const rawPartiesFilter = Array.isArray(filters.parties) ? filters.parties : [];
  const partiesFilter = Array.isArray(filters.parties)
    ? filters.parties.map(normalizeTextValue).filter(Boolean)
    : [];
  const streetId = Number.isFinite(Number(streets_index_id)) ? Number(streets_index_id) : null;
  const hasStreetId = streetId !== null && !Number.isNaN(streetId);
  console.log('[/canvass/nearby] request', {
    filters,
    countyFilter,
    cityFilter,
    districtCityFilter,
    rawPartiesFilter,
    partiesFilter,
    streetFilter,
    streets_index_id: streetId,
    useStreetId: hasStreetId,
    houseNumberFilter,
    range,
    limit,
  });

  try {
    const votersTable = await resolveTable(env, ['voters']);
    const addrTable = await resolveTable(env, ['voters_addr_norm', 'voters_addr', 'voter_addresses']);
    const phoneTable = await resolveTableOptional(env, ['best_phone', 'voter_phones', 'v_best_phone', 'best_phone_view']);
    const phoneColumns = phoneTable ? await getTableColumns(env, phoneTable) : [];
    const hasConfidenceColumn = phoneColumns.includes('confidence_code');
    const phoneJoinClause = phoneTable ? `LEFT JOIN ${phoneTable} bp ON v.voter_id = bp.voter_id` : '-- no phone table available';
    const phoneValueExpr = phoneTable ? "NULLIF(bp.phone_e164, '')" : 'NULL';
    const phoneValueSelectExpr = phoneTable ? `COALESCE(${phoneValueExpr}, '')` : `''`;
    const phoneConfidenceExpr = phoneTable && hasConfidenceColumn ? 'bp.confidence_code' : 'NULL';
    const useStreetId = hasStreetId;
    const addrColumns = await getTableColumns(env, addrTable);
    const fnExpr = addrColumns.includes('fn')
      ? "COALESCE(va.fn, '')"
      : addrColumns.includes('first_name')
        ? "COALESCE(va.first_name, '')"
        : "''";
    const lnExpr = addrColumns.includes('ln')
      ? "COALESCE(va.ln, '')"
      : addrColumns.includes('last_name')
        ? "COALESCE(va.last_name, '')"
        : "''";

    let query = `
      SELECT v.voter_id,
             ${fnExpr} AS first_name,
             ${lnExpr} AS last_name,
             COALESCE(va.addr1, '') AS address,
             COALESCE(va.city, '') AS city,
             COALESCE(va.zip, '') AS zip,
             v.county,
             v.political_party AS party,
             ${phoneValueSelectExpr} AS phone_e164,
             ${phoneConfidenceExpr} AS phone_confidence,
             COALESCE(va.house, v.house, '') AS house_district,
             COALESCE(va.senate, v.senate, '') AS senate_district
      FROM ${votersTable} v
      LEFT JOIN ${addrTable} va ON v.voter_id = va.voter_id
      ${phoneJoinClause}
      WHERE 1 = 1
    `;

    const params = [];
    let paramIndex = 1;

    if (useStreetId) {
      query += ` AND va.street_index_id = ?${paramIndex}`;
      params.push(streetId);
      paramIndex++;
    } else if (streetFilter) {
      query += ` AND UPPER(va.addr1) LIKE '%' || ?${paramIndex} || '%'`;
      params.push(streetFilter);
      paramIndex++;
    }

    // Filter by house number if provided (fast exact match)
    if (houseNumberFilter) {
      const houseNumberExpr = `TRIM(SUBSTR(va.addr_raw, 1, INSTR(va.addr_raw || ' ', ' ') - 1))`;
      query += ` AND va.addr_raw IS NOT NULL`;
    }

    if (voterIdFilter) {
      query += ` AND v.voter_id = ?${paramIndex}`;
      params.push(voterIdFilter);
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
      query += ` AND UPPER(v.political_party) IN (${placeholders})`;
      params.push(...partiesFilter);
    }
    if (filters.district_type && filters.district) {
      const column = filters.district_type === 'senate' ? 'v.senate' : 'v.house';
      query += ` AND ${column} = ?${paramIndex++}`;
      params.push(filters.district);
      if (districtCityFilter) {
        query += ` AND UPPER(TRIM(COALESCE(va.city, ''))) = ?${paramIndex++}`;
        params.push(districtCityFilter);
      }
    }

    if (house && range) {
      query += ` AND va.addr_raw IS NOT NULL AND va.addr_raw != ''`;
    }

    if (houseNumberFilter && numericHouse !== null) {
      const houseNumberExpr = `TRIM(SUBSTR(va.addr_raw, 1, INSTR(va.addr_raw || ' ', ' ') - 1))`;
      const houseNumberCasted = `CAST(${houseNumberExpr} AS INTEGER)`;
      query += ` ORDER BY CASE WHEN ${houseNumberCasted} IS NULL THEN 1 ELSE 0 END, ABS(${houseNumberCasted} - ?${paramIndex}) ASC, ${houseNumberCasted} ASC, v.voter_id LIMIT ?${paramIndex + 1}`;
      params.push(numericHouse, limit);
    } else {
      query += ` ORDER BY v.voter_id LIMIT ?${paramIndex}`;
      params.push(limit);
    }

    let result = await buildStatement(db, query, params).all();
    console.log('[/canvass/nearby] primary result count', result.results ? result.results.length : 0);

    // GUARD: If street_index_id search returns 0 results and we have a street name,
    // fall back to street name matching. This handles data misalignment where
    // voters_addr_norm.street_index_id may reference obsolete or cross-city IDs.
    if (useStreetId && (!result.results || result.results.length === 0) && streetFilter) {
      console.warn('[/canvass/nearby] No results for street_index_id; falling back to street name match', {
        county: countyFilter,
        city: cityFilter,
        street: streetFilter,
        streets_index_id: streetId,
      });

      // Rebuild query and params using street name pattern instead of street_index_id
      let fallbackQuery = `
        SELECT v.voter_id,
               ${fnExpr} AS first_name,
               ${lnExpr} AS last_name,
               COALESCE(va.addr1, '') AS address,
               COALESCE(va.city, '') AS city,
               COALESCE(va.zip, '') AS zip,
               v.county,
               v.political_party AS party,
               ${phoneValueSelectExpr} AS phone_e164,
               ${phoneConfidenceExpr} AS phone_confidence,
               COALESCE(va.house, v.house, '') AS house_district,
               COALESCE(va.senate, v.senate, '') AS senate_district
        FROM ${votersTable} v
        LEFT JOIN ${addrTable} va ON v.voter_id = va.voter_id
        ${phoneJoinClause}
        WHERE 1 = 1
          AND UPPER(va.addr1) LIKE '%' || ?1 || '%'
      `;

      const fallbackParams = [streetFilter];
      let fallbackParamIndex = 2;

      // Re-add all filters except street_index_id
      if (voterIdFilter) {
        fallbackQuery += ` AND v.voter_id = ?${fallbackParamIndex}`;
        fallbackParams.push(voterIdFilter);
        fallbackParamIndex++;
      }

      if (countyFilter) {
        fallbackQuery += ` AND v.county = ?${fallbackParamIndex}`;
        fallbackParams.push(countyFilter);
        fallbackParamIndex++;
      }

      if (cityFilter) {
        fallbackQuery += ` AND va.city = ?${fallbackParamIndex}`;
        fallbackParams.push(cityFilter);
        fallbackParamIndex++;
      }

      if (partiesFilter.length > 0) {
        const placeholders = partiesFilter.map(() => `?${fallbackParamIndex++}`).join(',');
        fallbackQuery += ` AND UPPER(v.political_party) IN (${placeholders})`;
        fallbackParams.push(...partiesFilter);
      }

      if (filters.district_type && filters.district) {
        const column = filters.district_type === 'senate' ? 'v.senate' : 'v.house';
        fallbackQuery += ` AND ${column} = ?${fallbackParamIndex++}`;
        fallbackParams.push(filters.district);
        if (districtCityFilter) {
          fallbackQuery += ` AND UPPER(TRIM(COALESCE(va.city, ''))) = ?${fallbackParamIndex++}`;
          fallbackParams.push(districtCityFilter);
        }
      }

      if (house && range) {
        fallbackQuery += ` AND va.addr_raw IS NOT NULL AND va.addr_raw != ''`;
      }

      if (houseNumberFilter && numericHouse !== null) {
        const houseNumberExpr = `TRIM(SUBSTR(va.addr_raw, 1, INSTR(va.addr_raw || ' ', ' ') - 1))`;
        const houseNumberCasted = `CAST(${houseNumberExpr} AS INTEGER)`;
        fallbackQuery += ` ORDER BY CASE WHEN ${houseNumberCasted} IS NULL THEN 1 ELSE 0 END, ABS(${houseNumberCasted} - ?${fallbackParamIndex}) ASC, ${houseNumberCasted} ASC, v.voter_id LIMIT ?${fallbackParamIndex + 1}`;
        fallbackParams.push(numericHouse, limit);
      } else {
        fallbackQuery += ` ORDER BY v.voter_id LIMIT ?${fallbackParamIndex}`;
        fallbackParams.push(limit);
      }

      result = await buildStatement(db, fallbackQuery, fallbackParams).all();
      console.log('[/canvass/nearby] fallback result count', result.results ? result.results.length : 0);
    }

    const rows = (result.results || []).map(row => ({
      voter_id: row.voter_id,
      first_name: row.first_name || '',
      last_name: row.last_name || '',
      name: [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Unknown',
      county: row.county || '',
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

router.post('/legislators', async (request, env, ctx) => {
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
    return missingTableResponse('wy_legislature', ctx.allowedOrigin);
  }

  try {
    const legislatorTable = await resolveTableOptional(env, [
      'wy_legislature',
      'wy_legislators',
      'legislators',
      'legislature',
    ]);
    if (!legislatorTable) {
      return ctx.jsonResponse(
        { ok: true, house: null, senate: null, missing: 'legislator_table' },
        200,
        ctx.allowedOrigin
      );
    }
    const houseDistrict = body.house_district ? String(body.house_district).trim() : null;
    const senateDistrict = body.senate_district ? String(body.senate_district).trim() : null;
    const [house, senate] = await Promise.all([
      getLegislatorByDistrict(db, legislatorTable, 'House', houseDistrict),
      getLegislatorByDistrict(db, legislatorTable, 'Senate', senateDistrict),
    ]);
    return ctx.jsonResponse({ ok: true, house, senate }, 200, ctx.allowedOrigin);
  } catch (err) {
    console.error('/legislators error', err);
    return ctx.jsonResponse({ ok: false, error: String(err?.message || err) }, 500, ctx.allowedOrigin);
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

  const { county, city, district_type, district, district_city } = body || {};

  const db = getDb(env);
  if (!db) {
    return missingTableResponse('streets_index', ctx.allowedOrigin);
  }

  try {
    await ensureAuth(request, env, ctx.config);
    const regionFilter = await buildRegionFilterClause(env, db, {
      county,
      city,
      district_type,
      district,
      district_city,
    });
    
    // Use streets_index for fast, clean street names
    const result = await db.prepare(`
      SELECT 
        si.id,
        si.street_canonical AS street_name
      FROM streets_index si
      JOIN wy_city_county cc ON si.city_county_id = cc.id
      WHERE ${regionFilter.clause}
      ORDER BY si.street_canonical
    `).bind(...regionFilter.params).all();

    const streets = (result.results || []).map(row => ({
      streets_index_id: row.id,
      id: row.id,
      name: row.street_name,
    }));

    // Fallback: if streets_index has no matches, derive street list from voters_addr_norm
    if (!streets.length) {
      const addrTable = await resolveTableOptional(env, ['voters_addr_norm', 'voters_addr', 'voter_addresses']);
      if (addrTable) {
        const fbResult = await db.prepare(`
          SELECT DISTINCT
            TRIM(REPLACE(REPLACE(va.addr1, SUBSTR(va.addr1, 1, INSTR(va.addr1, ' ')-1), ''), '  ', ' ')) AS street_name
          FROM ${addrTable} va
          JOIN wy_city_county cc ON va.city_county_id = cc.id
          WHERE ${regionFilter.clause}
            AND va.addr1 IS NOT NULL
            AND INSTR(va.addr1, ' ') > 0
          ORDER BY street_name
          LIMIT 400
        `).bind(...regionFilter.params).all();
        const fallbackStreets = (fbResult.results || [])
          .map(row => (row.street_name || '').toUpperCase().trim())
          .filter(Boolean)
          .map(name => ({ streets_index_id: null, id: null, name }));
        streets.push(...fallbackStreets);
      }
    }

    return ctx.jsonResponse(
      { ok: true, county, city, streets, total: streets.length },
      200,
      ctx.allowedOrigin,
      { 'Cache-Control': 'max-age=3600' }
    );
  } catch (err) {
    if (err instanceof BadRequestError) {
      return ctx.jsonResponse({ ok: false, error: err.message }, 400, ctx.allowedOrigin);
    }
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

  const { county, city, street, district_type, district, district_city, streets_index_id } = body || {};
  const normalizedStreet = (street || '').toString().trim().toUpperCase();
  const streetId = Number.isFinite(Number(streets_index_id)) ? Number(streets_index_id) : null;
  const hasStreetId = streetId !== null && !Number.isNaN(streetId);

  if (!normalizedStreet && !hasStreetId) {
    return ctx.jsonResponse(
      { ok: false, error: 'street is required' },
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

    const regionFilter = await buildRegionFilterClause(env, db, {
      county,
      city,
      district_type,
      district,
      district_city,
    });

    const params = [...regionFilter.params];

    // Prefer street_index_id if available, otherwise fall back to street name match
    let streetWhereClause = '';
    let fallbackStreetName = normalizedStreet;
    
    if (hasStreetId) {
      streetWhereClause = 'va.street_index_id = ?';
      params.push(streetId);
      
      // If we only have streets_index_id (no street name), look it up for potential fallback
      if (!normalizedStreet) {
        const streetLookup = await db.prepare(`
          SELECT street_canonical FROM streets_index WHERE id = ?
        `).bind(streetId).first();
        if (streetLookup?.street_canonical) {
          fallbackStreetName = streetLookup.street_canonical.toUpperCase().trim();
        }
      }
    } else if (normalizedStreet) {
      // Match against addr1 using LIKE pattern (addr1 contains house numbers)
      streetWhereClause = 'va.addr1 LIKE ?';
      params.push(`%${normalizedStreet}%`);
    } else {
      return ctx.jsonResponse(
        { ok: false, error: 'street_index_id or street name is required' },
        400,
        ctx.allowedOrigin
      );
    }

    // Get unique voters on this street and extract distinct house numbers
    // Note: addr_raw contains the full address (e.g., "5201 RAVEN ST")
    // Extract house number as the first word from addr_raw
    let result = await db.prepare(`
      SELECT DISTINCT
        TRIM(SUBSTR(va.addr_raw, 1, INSTR(va.addr_raw || ' ', ' ') - 1)) AS house_number,
        COUNT(*) OVER (PARTITION BY TRIM(SUBSTR(va.addr_raw, 1, INSTR(va.addr_raw || ' ', ' ') - 1))) AS voter_count
      FROM voters_addr_norm va
      JOIN wy_city_county cc ON va.city_county_id = cc.id
      WHERE ${regionFilter.clause}
        AND ${streetWhereClause}
        AND va.addr_raw IS NOT NULL
      ORDER BY CAST(house_number AS NUMERIC) ASC, house_number ASC
    `).bind(...params).all();

    // GUARD: If street_index_id search returns 0 results and we have a fallback street name,
    // fall back to street name matching. This handles data misalignment where
    // voters_addr_norm.street_index_id may reference obsolete or cross-city IDs.
    if (hasStreetId && (!result.results || result.results.length === 0) && fallbackStreetName) {
      console.warn('[/houses] No results for street_index_id; falling back to street name match', {
        county, city, street: fallbackStreetName, streets_index_id: streetId,
      });
      
      // Rebuild params with street name pattern instead of street_index_id
      // Use LIKE pattern to match street names in addr1 (which include house numbers)
      const fallbackParams = [...regionFilter.params, `%${fallbackStreetName}%`];
      result = await db.prepare(`
        SELECT DISTINCT
          TRIM(SUBSTR(va.addr_raw, 1, INSTR(va.addr_raw || ' ', ' ') - 1)) AS house_number,
          COUNT(*) OVER (PARTITION BY TRIM(SUBSTR(va.addr_raw, 1, INSTR(va.addr_raw || ' ', ' ') - 1))) AS voter_count
        FROM voters_addr_norm va
        JOIN wy_city_county cc ON va.city_county_id = cc.id
        WHERE ${regionFilter.clause}
          AND va.addr1 LIKE ?
          AND va.addr_raw IS NOT NULL
        ORDER BY CAST(house_number AS NUMERIC) ASC, house_number ASC
      `).bind(...fallbackParams).all();
    }

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
    if (err instanceof BadRequestError) {
      return ctx.jsonResponse({ ok: false, error: err.message }, 400, ctx.allowedOrigin);
    }
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

router.post('/script', async (request, env, ctx) => {
  let body;
  try {
    body = await readJson(request);
  } catch (err) {
    if (err instanceof BadRequestError) {
      return ctx.jsonResponse({ ok: false, error: err.message }, err.status, ctx.allowedOrigin);
    }
    throw err;
  }

  const { voter_id, channel = 'phone', use_script = true, touchpoint_id } = body || {};
  if (!voter_id) {
    return ctx.jsonResponse(
      { ok: false, error: 'Missing required parameter: voter_id' },
      400,
      ctx.allowedOrigin
    );
  }

  try {
    await ensureAuth(request, env, ctx.config);
  } catch (err) {
    const status = err?.status === 401 ? 401 : 500;
    return ctx.jsonResponse(
      { ok: false, error: String(err?.message || err) },
      status,
      ctx.allowedOrigin
    );
  }

  const db = getDb(env);
  if (!db) {
    return missingTableResponse('campaign_touchpoints', ctx.allowedOrigin);
  }

  const contactTable = await resolveTableOptional(env, ['voter_contacts', 'voter_contact']);
  let contactedBefore = false;
  if (contactTable) {
    const existingContact = await buildStatement(
      db,
      `SELECT id FROM ${contactTable} WHERE voter_id = ?1 LIMIT 1`,
      [voter_id]
    ).first();
    contactedBefore = !!existingContact;
  }

  let touchpointPayload = null;
  if (use_script !== false) {
    const touchpointTable = await resolveTableOptional(env, ['campaign_touchpoints']);
    const segmentTable = await resolveTableOptional(env, ['campaign_touchpoint_segments']);
    if (touchpoint_id && touchpointTable) {
      const explicit = await fetchTouchpointById(env, db, touchpointTable, segmentTable, touchpoint_id);
      if (explicit && explicit.is_active === 1 && touchpointSupportsChannel(explicit, channel)) {
        touchpointPayload = explicit;
      }
    }
    if (!touchpointPayload) {
      const voterProfile = await getVoterProfile(env, db, voter_id);
      touchpointPayload = await pickTouchpoint(env, db, channel, voterProfile);
    }
  }

  return ctx.jsonResponse(
    {
      ok: true,
      voter_id: String(voter_id),
      contacted_before: contactedBefore,
      script_enabled: use_script !== false && !!touchpointPayload,
      icebreaker: touchpointPayload?.icebreaker || DEFAULT_ICEBREAKER,
      touchpoint: touchpointPayload
        ? {
            touchpoint_id: touchpointPayload.touchpoint_id,
            label: touchpointPayload.label,
            body: touchpointPayload.body,
            cta_question: touchpointPayload.cta_question,
            issue_tag: touchpointPayload.issue_tag,
            metadata: parseJsonSafe(touchpointPayload.metadata),
          }
        : null,
    },
    200,
    ctx.allowedOrigin
  );
});

router.get('/script/touchpoints', async (request, env, ctx) => {
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    if (!auth?.email) {
      return ctx.jsonResponse(
        { ok: false, error: 'Unauthorized' },
        401,
        ctx.allowedOrigin
      );
    }

    const db = getDb(env);
    if (!db) {
      return missingTableResponse('campaign_touchpoints', ctx.allowedOrigin);
    }

    const touchpointTable = await resolveTableOptional(env, ['campaign_touchpoints']);
    if (!touchpointTable) {
      return ctx.jsonResponse(
        { ok: true, touchpoints: [] },
        200,
        ctx.allowedOrigin
      );
    }

    const result = await buildStatement(
      db,
      `
        SELECT touchpoint_id, label, issue_tag, channels, priority, is_active
        FROM ${touchpointTable}
        WHERE is_active = 1
        ORDER BY priority ASC, updated_at DESC
      `
    ).all();

    return ctx.jsonResponse(
      { ok: true, touchpoints: result?.results || [] },
      200,
      ctx.allowedOrigin
    );
  } catch (err) {
    if (err?.status === 401) {
      return ctx.jsonResponse(
        { ok: false, error: 'Unauthorized' },
        401,
        ctx.allowedOrigin
      );
    }
    console.error('/script/touchpoints error', err);
    return ctx.jsonResponse(
      { ok: false, error: String(err?.message || err) },
      500,
      ctx.allowedOrigin
    );
  }
});

router.post('/contact-form/search-names', async (request, env, ctx) => {
  let body;
  try {
    body = await readJson(request);
  } catch (err) {
    if (err instanceof BadRequestError) {
      return ctx.jsonResponse({ ok: false, error: err.message }, err.status, ctx.allowedOrigin);
    }
    throw err;
  }

  const county = normalizeTextValue(body?.county) || null;
  const city = normalizeTextValue(body?.city) || null;
  const lastName = normalizeTextValue(body?.lastName || body?.last_name);
  const firstName = normalizeTextValue(body?.firstName || body?.first_name || '');
  if (!lastName) {
    return ctx.jsonResponse(
      { ok: false, error: 'lastName is required' },
      400,
      ctx.allowedOrigin
    );
  }

  try {
    await ensureAuth(request, env, ctx.config);
  } catch (err) {
    const status = err?.status === 401 ? 401 : 500;
    return ctx.jsonResponse(
      { ok: false, error: String(err?.message || err) },
      status,
      ctx.allowedOrigin
    );
  }

  try {
    const db = getDb(env);
    if (!db) {
      return missingTableResponse('voters', ctx.allowedOrigin);
    }
    const matches = await searchSimilarNames(db, {
      county,
      city,
      firstName,
      lastName,
    });
    const rows = matches.map(row => ({
      voter_id: row.voter_id,
      first_name: row.first_name || '',
      last_name: row.last_name || '',
      name: [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || 'Unknown',
      address: row.addr1 || '',
      city: row.city || '',
      county: row.county || '',
      zip: row.zip || '',
      party: row.political_party || '',
      phone_e164: row.phone_e164 || null,
      match_score: typeof row.match_score === 'number' ? row.match_score : null,
    }));
    return ctx.jsonResponse({ ok: true, rows }, 200, ctx.allowedOrigin);
  } catch (err) {
    console.error('/contact-form/search-names error', err);
    return ctx.jsonResponse(
      { ok: false, error: String(err?.message || err) },
      500,
      ctx.allowedOrigin
    );
  }
});

router.post('/volunteer-staging', async (request, env, ctx) => {
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
    return missingTableResponse('volunteer_staging', ctx.allowedOrigin);
  }

  let stagingTable;
  try {
    stagingTable = await resolveTable(env, ['volunteer_staging']);
  } catch (err) {
    if (err instanceof DependencyMissingError) {
      return missingTableResponse(err.table, ctx.allowedOrigin);
    }
    throw err;
  }

  try {
    const auth = await ensureAuth(request, env, ctx.config);
    const actionRaw = (body.action || body.mode || 'new').toString().toLowerCase();
    const action = actionRaw === 'update' ? 'update' : 'new';
    const firstName = (body.first_name || body.firstName || '').trim();
    const lastName = (body.last_name || body.lastName || '').trim();
    const email = (body.email || body.volunteer_email || '').trim().toLowerCase();
    const cellPhone = normalizeCellPhone(body.cell_phone || body.phone || body.phone_number);
    const state = (body.state || 'WY').toString().trim().toUpperCase() || 'WY';
    const county = (body.county || '').toString().trim().toUpperCase() || null;
    const city = (body.city || '').toString().trim().toUpperCase() || null;
    let targetId = (body.target_id || body.volunteer_id || '').toString().trim() || null;
    const notes = body.notes ? String(body.notes).trim() : null;
    const isActive = body.is_active === undefined ? null : coerceBooleanFlag(body.is_active, 1);

    const missing = [];
    if (!firstName && !lastName) missing.push('name');
    if (!email && !cellPhone) missing.push('email_or_cell_phone');
    if (missing.length) {
      return ctx.jsonResponse(
        { ok: false, error: `Missing required fields: ${missing.join(', ')}` },
        400,
        ctx.allowedOrigin
      );
    }

    const isSelfTarget = targetId && auth.email && targetId.toLowerCase() === auth.email.toLowerCase();
    const isUserAdmin = isAdmin(auth.email, env);
    if (action === 'update' && !isUserAdmin && !isSelfTarget) {
      return ctx.jsonResponse(
        { ok: false, error: 'Admin required to update another volunteer' },
        403,
        ctx.allowedOrigin
      );
    }
    if (action === 'update' && !targetId && !isUserAdmin && auth.email) {
      targetId = auth.email;
    }

    const stagingColumns = await getTableColumns(env, stagingTable);
    const hasStateColumn = stagingColumns.includes('state');

    const insertColumns = [
      'submitted_by',
      'action',
      'target_id',
      'first_name',
      'last_name',
      'email',
      'cell_phone',
      'county',
      'city',
    ];
    const params = [
      auth.email || 'unknown@local',
      action,
      targetId,
      firstName || null,
      lastName || null,
      email || null,
      cellPhone || null,
      county,
      city,
    ];

    if (hasStateColumn) {
      insertColumns.push('state');
      params.push(state);
    }

    insertColumns.push('notes', 'is_active', 'review_status', 'created_at');
    params.push(notes, isActive, 'pending', new Date().toISOString().replace('T', ' ').slice(0, 19));

    const placeholders = insertColumns.map((_, idx) => `?${idx + 1}`).join(', ');

    const result = await buildStatement(
      db,
      `INSERT INTO ${stagingTable} (${insertColumns.join(', ')}) VALUES (${placeholders})`,
      params
    ).run();

    const stagingId = result?.meta?.last_row_id ?? null;
    const notification = await maybeSendVolunteerNotification(env, {
      stagingId,
      action,
      targetId,
      email,
      firstName,
      lastName,
      county,
      city,
      state,
    });

    return ctx.jsonResponse(
      {
        ok: true,
        staging_id: stagingId,
        review_status: 'pending',
        notification,
      },
      200,
      ctx.allowedOrigin
    );
  } catch (err) {
    if (err instanceof DependencyMissingError) {
      return missingTableResponse(err.table, ctx.allowedOrigin);
    }
    console.error('/volunteer-staging error', err);
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
    const volEmail = body.volEmail || auth.email || 'unknown@local';
    
    // Map frontend fields to database columns
    const needsReview = body.potentialMatches && body.potentialMatches.length > 0 ? 1 : 0;
    
    const insertQuery = `
      INSERT INTO ${stagingTable} (
        submitted_by, vol_email, search_county, search_city, 
        search_street_name, search_house_number,
        fn, ln, middle_name, suffix, 
        addr1, house_number, street_name, unit_number,
        city, county, state, zip, 
        phone_e164, phone_secondary, email,
        political_party, voting_likelihood, 
        contact_method, interaction_notes, issues_interested, volunteer_notes,
        potential_matches, needs_manual_review,
        pulse_optin, pulse_phone_digits
      ) VALUES (
        ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
        ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20,
        ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31
      )
    `;
    
    const result = await buildStatement(
      db,
      insertQuery,
      [
        volEmail,                           // 1: submitted_by
        volEmail,                           // 2: vol_email
        body.county,                        // 3: search_county
        body.city,                          // 4: search_city
        body.streetName || null,            // 5: search_street_name
        body.houseNumber || null,           // 6: search_house_number
        body.firstName,                     // 7: fn
        body.lastName,                      // 8: ln
        body.middleName || null,            // 9: middle_name
        body.suffix || null,                // 10: suffix
        body.fullAddress,                   // 11: addr1
        body.houseNumber || null,           // 12: house_number
        body.streetName || null,            // 13: street_name
        body.unitNumber || null,            // 14: unit_number
        body.city,                          // 15: city
        body.county,                        // 16: county
        'WY',                               // 17: state
        body.zipCode || null,               // 18: zip
        body.phonePrimary || null,          // 19: phone_e164
        body.phoneSecondary || null,        // 20: phone_secondary
        body.email || null,                 // 21: email
        body.estimatedParty || null,        // 22: political_party
        body.votingLikelihood || null,      // 23: voting_likelihood
        body.contactMethod || null,         // 24: contact_method
        body.interactionNotes || null,      // 25: interaction_notes
        body.issuesInterested || null,      // 26: issues_interested
        body.volunteerNotes || null,        // 27: volunteer_notes
        JSON.stringify(body.potentialMatches || []), // 28: potential_matches
        needsReview,                        // 29: needs_manual_review
        body.pulseOptIn ? 1 : 0,            // 30: pulse_optin
        body.pulsePhoneDigits || null       // 31: pulse_phone_digits
      ]
    ).run();
    
    const stagingId = result?.meta?.last_row_id ?? null;
    
    // Get the auto-generated voter_id from trigger
    let tempVoterId = null;
    if (stagingId) {
      const voterResult = await buildStatement(
        db,
        `SELECT voter_id FROM ${stagingTable} WHERE staging_id = ?1`,
        [stagingId]
      ).first();
      tempVoterId = voterResult?.voter_id || `TEMP-${String(stagingId).padStart(8, '0')}`;
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

const FIELD_CONSENT_TEXT_VERSION = 'field-location-v1';

function getPathSegmentAfter(path, marker) {
  const parts = String(path || '').split('/').filter(Boolean);
  const index = parts.indexOf(marker);
  if (index === -1 || index + 1 >= parts.length) return null;
  return decodeURIComponent(parts[index + 1]);
}

function normalizeFieldTaskType(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (normalized === 'next_stop' || normalized === 'confirmed_next_stop') return 'next_stop';
  return 'call_ahead';
}

function normalizeFieldTaskStatus(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
  const allowed = new Set(['open', 'claimed', 'confirmed', 'done', 'cancelled']);
  return allowed.has(normalized) ? normalized : 'open';
}

function normalizeTeamId(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  const slug = raw.replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
  return slug || null;
}

function getSupportScope(email, env) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const globalEmails = new Set(
    String(env?.GLOBAL_DISPATCH_EMAILS || '')
      .split(',')
      .map(item => item.trim().toLowerCase())
      .filter(Boolean)
  );

  if (globalEmails.has(normalizedEmail)) {
    return { global: true, teams: new Set() };
  }

  const rawMemberships = String(env?.TEAM_MEMBERSHIPS_JSON || '').trim();
  if (!rawMemberships) {
    // Backward-compat: no team map configured means existing behavior.
    return { global: true, teams: new Set() };
  }

  try {
    const parsed = JSON.parse(rawMemberships);
    const membership = parsed?.[normalizedEmail];
    if (!membership) return { global: false, teams: new Set() };

    const teams = Array.isArray(membership) ? membership : [membership];
    const normalizedTeams = new Set();
    for (const team of teams) {
      if (team === '*') return { global: true, teams: new Set() };
      const normalizedTeam = normalizeTeamId(team);
      if (normalizedTeam) normalizedTeams.add(normalizedTeam);
    }
    return { global: false, teams: normalizedTeams };
  } catch {
    return { global: true, teams: new Set() };
  }
}

function hasTeamAccess(scope, teamId) {
  if (scope.global) return true;
  if (!teamId) return true;
  return scope.teams.has(normalizeTeamId(teamId));
}

function buildTeamScopeWhere(scope, params, { includeUnscoped = true } = {}) {
  if (scope.global || !scope.teams.size) return '';
  const placeholders = [];
  for (const team of scope.teams) {
    placeholders.push(`?${params.length + 1}`);
    params.push(team);
  }
  const inClause = `team_id IN (${placeholders.join(',')})`;
  return includeUnscoped ? `(${inClause} OR team_id IS NULL)` : inClause;
}

async function fetchVolunteerTeamContext(env, db, volunteerTable, id) {
  const columns = await getTableColumns(env, volunteerTable);
  const hasTeam = columns.includes('team_id');
  const hasQueue = columns.includes('support_queue');
  if (!hasTeam && !hasQueue) return null;

  const selected = [];
  if (hasTeam) selected.push('team_id');
  if (hasQueue) selected.push('support_queue');
  const row = await buildStatement(
    db,
    `SELECT ${selected.join(', ')}
     FROM ${volunteerTable}
     WHERE lower(trim(id)) = lower(trim(?1))
     LIMIT 1`,
    [String(id || '').trim().toLowerCase()]
  ).first();
  return row || null;
}

async function getFieldTaskForScope(db, tasksTable, taskId, scope) {
  const task = await buildStatement(db, `SELECT * FROM ${tasksTable} WHERE id = ?1`, [taskId]).first();
  if (!task) return null;
  if (!hasTeamAccess(scope, task.team_id)) {
    const error = new Error('team scope denied');
    error.status = 403;
    throw error;
  }
  return task;
}

function assertExpectedVersion(task, expectedVersion) {
  const parsedExpected = Number(expectedVersion);
  const currentVersion = Number(task?.version || 1);
  if (!Number.isFinite(parsedExpected) || parsedExpected !== currentVersion) {
    const error = new Error('version_conflict');
    error.status = 409;
    error.payload = { ok: false, error: 'version_conflict', current_version: currentVersion };
    throw error;
  }
}

async function updateFieldTaskRow(db, tasksTable, taskId, updates, params = []) {
  const assignments = [...updates, `updated_at = datetime('now')`];
  await buildStatement(
    db,
    `UPDATE ${tasksTable}
     SET ${assignments.join(', ')}
     WHERE id = ?${params.length + 1}`,
    [...params, taskId]
  ).run();
  return buildStatement(db, `SELECT * FROM ${tasksTable} WHERE id = ?1`, [taskId]).first();
}

async function getActiveFieldSessionForEmail(db, email) {
  return buildStatement(
    db,
    `SELECT *
     FROM field_sessions
     WHERE lower(volunteer_email) = lower(?1)
       AND status = 'active'
     ORDER BY started_at DESC, id DESC
     LIMIT 1`,
    [email]
  ).first();
}

async function getFieldSessionForOwner(db, sessionId, email) {
  return buildStatement(
    db,
    `SELECT *
     FROM field_sessions
     WHERE id = ?1
       AND lower(volunteer_email) = lower(?2)
     LIMIT 1`,
    [sessionId, email]
  ).first();
}

router.post('/field-sessions', async (request, env, ctx) => {
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    const db = getDb(env);
    if (!db) return missingTableResponse('field_sessions', ctx.allowedOrigin);

    const table = await resolveTable(env, ['field_sessions']);
    const email = (auth.email || '').trim().toLowerCase();
    if (!email) {
      return ctx.jsonResponse({ ok: false, error: 'Authenticated email required' }, 401, ctx.allowedOrigin);
    }

    const existing = await getActiveFieldSessionForEmail(db, email);
    if (existing) {
      return ctx.jsonResponse({ ok: true, session: existing, reused: true }, 200, ctx.allowedOrigin);
    }

    let body = {};
    try {
      const raw = await request.text();
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = {};
    }

    let displayName = email;
    let teamId = normalizeTeamId(body?.team_id);
    let supportQueue = body?.support_queue ? String(body.support_queue).trim() : null;
    const volunteerTable = await resolveTableOptional(env, ['volunteers']);
    if (volunteerTable) {
      const volunteer = await fetchVolunteerById(env, db, volunteerTable, email);
      displayName = deriveVolunteerDisplayName(volunteer, email);
      const volunteerContext = await fetchVolunteerTeamContext(env, db, volunteerTable, email);
      if (!teamId && volunteerContext?.team_id) {
        teamId = normalizeTeamId(volunteerContext.team_id);
      }
      if (!supportQueue && volunteerContext?.support_queue) {
        supportQueue = String(volunteerContext.support_queue).trim();
      }
    }

    const result = await buildStatement(
      db,
      `INSERT INTO ${table} (volunteer_email, volunteer_name, status, sharing_enabled, team_id, support_queue)
       VALUES (?1, ?2, 'active', 0, ?3, ?4)`,
      [email, displayName, teamId, supportQueue]
    ).run();
    const sessionId = result?.meta?.last_row_id;
    const session = await buildStatement(db, `SELECT * FROM ${table} WHERE id = ?1`, [sessionId]).first();
    return ctx.jsonResponse({ ok: true, session }, 201, ctx.allowedOrigin);
  } catch (err) {
    if (err instanceof DependencyMissingError) return missingTableResponse(err.table, ctx.allowedOrigin);
    console.error('/field-sessions error', err);
    return ctx.jsonResponse({ ok: false, error: String(err?.message || err) }, 500, ctx.allowedOrigin);
  }
});

router.get('/field-sessions/me', async (request, env, ctx) => {
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    const db = getDb(env);
    if (!db) return missingTableResponse('field_sessions', ctx.allowedOrigin);
    await resolveTable(env, ['field_sessions']);
    const email = (auth.email || '').trim().toLowerCase();
    const session = email ? await getActiveFieldSessionForEmail(db, email) : null;

    let tasks = [];
    if (session) {
      const tasksTable = await resolveTableOptional(env, ['field_session_tasks']);
      if (tasksTable) {
        const tasksResult = await buildStatement(
          db,
          `SELECT * FROM ${tasksTable}
           WHERE session_id = ?1
             AND status NOT IN ('done', 'cancelled')
           ORDER BY created_at ASC, id ASC`,
          [session.id]
        ).all();
        tasks = tasksResult.results || [];
      }
    }

    return ctx.jsonResponse({ ok: true, session, tasks }, 200, ctx.allowedOrigin);
  } catch (err) {
    if (err instanceof DependencyMissingError) return missingTableResponse(err.table, ctx.allowedOrigin);
    const status = err?.status === 401 ? 401 : 500;
    return ctx.jsonResponse({ ok: false, error: String(err?.message || err) }, status, ctx.allowedOrigin);
  }
});

router.post('/field-sessions/:id/location', async (request, env, ctx) => {
  let body;
  try {
    body = await readJson(request);
  } catch (err) {
    if (err instanceof BadRequestError) return ctx.jsonResponse({ ok: false, error: err.message }, err.status, ctx.allowedOrigin);
    throw err;
  }

  try {
    const auth = await ensureAuth(request, env, ctx.config);
    const db = getDb(env);
    if (!db) return missingTableResponse('field_sessions', ctx.allowedOrigin);
    const table = await resolveTable(env, ['field_sessions']);
    const email = (auth.email || '').trim().toLowerCase();
    if (!email) {
      return ctx.jsonResponse({ ok: false, error: 'Authenticated email required' }, 401, ctx.allowedOrigin);
    }
    const sessionId = Number(getPathSegmentAfter(new URL(request.url).pathname, 'field-sessions'));
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    const accuracy = body?.accuracy_m ?? body?.accuracy ?? null;
    if (!Number.isFinite(sessionId) || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return ctx.jsonResponse({ ok: false, error: 'session id, lat, and lng are required' }, 400, ctx.allowedOrigin);
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return ctx.jsonResponse({ ok: false, error: 'invalid coordinates' }, 400, ctx.allowedOrigin);
    }
    const session = await getFieldSessionForOwner(db, sessionId, email);
    if (!session || session.status !== 'active') {
      return ctx.jsonResponse({ ok: false, error: 'active field session not found' }, 404, ctx.allowedOrigin);
    }

    const streetHint = body?.street_hint ? String(body.street_hint).trim().slice(0, 120) : null;
    const cityHint = body?.city_hint ? String(body.city_hint).trim().slice(0, 80) : null;

    const baseParams = [
      lat,
      lng,
      Number.isFinite(Number(accuracy)) ? Number(accuracy) : null,
      body?.consent_text_version || FIELD_CONSENT_TEXT_VERSION,
      sessionId,
      streetHint,
      cityHint,
    ];

    try {
      await buildStatement(
        db,
        `UPDATE ${table}
         SET sharing_enabled = 1,
             latest_lat = ?1,
             latest_lng = ?2,
             latest_accuracy_m = ?3,
             latest_location_at = datetime('now'),
             consent_text_version = ?4,
             street_hint = COALESCE(?6, street_hint),
             city_hint = COALESCE(?7, city_hint),
             stopped_sharing_at = NULL,
             updated_at = datetime('now')
         WHERE id = ?5`,
        baseParams
      ).run();
    } catch (updateErr) {
      const msg = String(updateErr?.message || updateErr || '');
      const missingHintColumn = msg.includes('no such column: street_hint') || msg.includes('no such column: city_hint');
      if (!missingHintColumn) throw updateErr;

      // Drift-safe fallback for environments where hint columns were not created yet.
      await buildStatement(
        db,
        `UPDATE ${table}
         SET sharing_enabled = 1,
             latest_lat = ?1,
             latest_lng = ?2,
             latest_accuracy_m = ?3,
             latest_location_at = datetime('now'),
             consent_text_version = ?4,
             stopped_sharing_at = NULL,
             updated_at = datetime('now')
         WHERE id = ?5`,
        baseParams.slice(0, 5)
      ).run();
    }
    const updated = await buildStatement(db, `SELECT * FROM ${table} WHERE id = ?1`, [sessionId]).first();
    return ctx.jsonResponse({ ok: true, session: updated }, 200, ctx.allowedOrigin);
  } catch (err) {
    if (err instanceof DependencyMissingError) return missingTableResponse(err.table, ctx.allowedOrigin);
    const status = Number.isInteger(err?.status) ? err.status : 500;
    console.error('/field-sessions/:id/location error', { status, error: String(err?.message || err) });
    return ctx.jsonResponse({ ok: false, error: String(err?.message || err) }, status, ctx.allowedOrigin);
  }
});

router.get('/field-sessions/:id/nearby-address', async (request, env, ctx) => {
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    const email = (auth.email || '').trim().toLowerCase();
    if (!email) {
      return ctx.jsonResponse({ ok: false, error: 'Authenticated email required' }, 401, ctx.allowedOrigin);
    }

    const db = getDb(env);
    if (!db) return missingTableResponse('field_sessions', ctx.allowedOrigin);

    const sessionId = Number(getPathSegmentAfter(new URL(request.url).pathname, 'field-sessions'));
    if (!Number.isFinite(sessionId)) {
      return ctx.jsonResponse({ ok: false, error: 'valid session id required' }, 400, ctx.allowedOrigin);
    }

    const session = await getFieldSessionForOwner(db, sessionId, email);
    if (!session) {
      return ctx.jsonResponse({ ok: false, error: 'field session not found' }, 404, ctx.allowedOrigin);
    }

    const lat = Number(session.latest_lat);
    const lng = Number(session.latest_lng);
    const streetHintRaw = (session.street_hint || '').trim();
    const cityHint = (session.city_hint || '').trim();

    const hintNumberMatch = streetHintRaw.match(/^(\d{1,6})\s+/);
    const hintHouseNumber = hintNumberMatch ? Number(hintNumberMatch[1]) : null;
    const streetToken = streetHintRaw
      .replace(/^\d{1,6}\s+/, '')
      .replace(/\b(street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|court|ct|place|pl)\b/gi, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .find(part => part.length >= 3) || null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return ctx.jsonResponse({ ok: true, nearby_address: null, reason: 'no_location' }, 200, ctx.allowedOrigin);
    }

    const addrTable = await resolveTableOptional(env, ['voters_addr_norm', 'voters_addr', 'voter_addresses']);
    if (!addrTable) {
      return ctx.jsonResponse({ ok: true, nearby_address: null, reason: 'address_table_missing' }, 200, ctx.allowedOrigin);
    }

    const addrColumns = await getTableColumns(env, addrTable);
    const hasCoords = addrColumns.includes('lat') && addrColumns.includes('lng');

    const getStreetFallback = async () => {
      if (!streetToken) return null;
      const fallback = await buildStatement(
        db,
        `SELECT
           COALESCE(addr1, '') AS address,
           COALESCE(city, '') AS city,
           COALESCE(zip, '') AS zip,
           CASE
             WHEN INSTR(addr1, ' ') > 1 THEN ABS(CAST(SUBSTR(addr1, 1, INSTR(addr1, ' ') - 1) AS INTEGER) - ?3)
             ELSE 999999
           END AS number_gap
         FROM ${addrTable}
         WHERE UPPER(addr1) LIKE '%' || UPPER(?1) || '%'
           AND (?2 = '' OR UPPER(city) = UPPER(?2))
         ORDER BY CASE WHEN ?3 IS NULL THEN 0 ELSE number_gap END ASC, addr1 ASC
         LIMIT 1`,
        [streetToken, cityHint || '', hintHouseNumber]
      ).first();
      if (!fallback) return null;
      return [fallback.address, fallback.city, fallback.zip].filter(Boolean).join(', ');
    };

    if (!hasCoords) {
      const streetFallback = await getStreetFallback();
      return ctx.jsonResponse(
        {
          ok: true,
          nearby_address: streetFallback,
          reason: streetFallback ? 'same_street_fallback' : 'address_coords_missing',
        },
        200,
        ctx.allowedOrigin
      );
    }

    const radiusFeet = 200;
    const radiusMeters = radiusFeet * 0.3048;
    const latMetersPerDegree = 111320;
    const lngMetersPerDegree = Math.max(1e-6, 111320 * Math.cos((lat * Math.PI) / 180));
    const latDelta = radiusMeters / latMetersPerDegree;
    const lngDelta = radiusMeters / lngMetersPerDegree;
    const nearest = await buildStatement(
      db,
      `SELECT
         COALESCE(addr1, '') AS address,
         COALESCE(city, '') AS city,
         COALESCE(zip, '') AS zip,
         (((lat - ?5) * ?7) * ((lat - ?5) * ?7) + ((lng - ?6) * ?8) * ((lng - ?6) * ?8)) AS distance2_m
       FROM ${addrTable}
       WHERE lat IS NOT NULL
         AND lng IS NOT NULL
         AND lat BETWEEN ?1 AND ?2
         AND lng BETWEEN ?3 AND ?4
       ORDER BY distance2_m ASC
       LIMIT 1`,
      [lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta, lat, lng, latMetersPerDegree, lngMetersPerDegree]
    ).first();

    if (!nearest) {
      const streetFallback = await getStreetFallback();
      return ctx.jsonResponse(
        {
          ok: true,
          nearby_address: streetFallback,
          reason: streetFallback ? 'same_street_fallback' : 'no_nearby_match',
        },
        200,
        ctx.allowedOrigin
      );
    }

    const distanceMeters = Math.sqrt(Number(nearest.distance2_m));
    if (!Number.isFinite(distanceMeters) || distanceMeters > radiusMeters) {
      const streetFallback = await getStreetFallback();
      return ctx.jsonResponse(
        {
          ok: true,
          nearby_address: streetFallback,
          reason: streetFallback ? 'same_street_fallback' : 'outside_radius',
          nearest_distance_ft: Number.isFinite(distanceMeters) ? Math.round(distanceMeters * 3.28084) : null,
        },
        200,
        ctx.allowedOrigin
      );
    }

    const nearbyAddress = [nearest.address, nearest.city, nearest.zip].filter(Boolean).join(', ');
    return ctx.jsonResponse(
      {
        ok: true,
        nearby_address: nearbyAddress || null,
        nearest_distance_ft: Math.round(distanceMeters * 3.28084),
      },
      200,
      ctx.allowedOrigin
    );
  } catch (err) {
    if (err instanceof DependencyMissingError) return missingTableResponse(err.table, ctx.allowedOrigin);
    const status = Number.isInteger(err?.status) ? err.status : 500;
    console.error('/field-sessions/:id/nearby-address error', { status, error: String(err?.message || err) });
    return ctx.jsonResponse({ ok: false, error: String(err?.message || err) }, status, ctx.allowedOrigin);
  }
});

router.post('/field-sessions/:id/nearby-address-hint', async (request, env, ctx) => {
  let body;
  try {
    body = await readJson(request);
  } catch (err) {
    if (err instanceof BadRequestError) return ctx.jsonResponse({ ok: false, error: err.message }, err.status, ctx.allowedOrigin);
    throw err;
  }

  try {
    const auth = await ensureAuth(request, env, ctx.config);
    const email = (auth.email || '').trim().toLowerCase();
    if (!email) {
      return ctx.jsonResponse({ ok: false, error: 'Authenticated email required' }, 401, ctx.allowedOrigin);
    }

    const db = getDb(env);
    if (!db) return missingTableResponse('field_sessions', ctx.allowedOrigin);

    const sessionId = Number(getPathSegmentAfter(new URL(request.url).pathname, 'field-sessions'));
    if (!Number.isFinite(sessionId)) {
      return ctx.jsonResponse({ ok: false, error: 'valid session id required' }, 400, ctx.allowedOrigin);
    }

    const session = await getFieldSessionForOwner(db, sessionId, email);
    if (!session) {
      return ctx.jsonResponse({ ok: false, error: 'field session not found' }, 404, ctx.allowedOrigin);
    }

    const userAddress = String(body?.address || '').trim();
    if (!userAddress) {
      return ctx.jsonResponse({ ok: false, error: 'address is required' }, 400, ctx.allowedOrigin);
    }
    if (userAddress.length > 140) {
      return ctx.jsonResponse({ ok: false, error: 'address is too long' }, 400, ctx.allowedOrigin);
    }

    const cityHint = String(body?.city || session.city_hint || '').trim();
    const query = cityHint ? `${userAddress}, ${cityHint}` : userAddress;
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=${encodeURIComponent(query)}`;
    const geocodeRes = await fetch(url, {
      headers: {
        'Accept-Language': 'en',
        'User-Agent': 'grassrootsmvt-field-support/1.0',
      },
    });

    if (!geocodeRes.ok) {
      return ctx.jsonResponse({ ok: false, error: `geocode_failed_http_${geocodeRes.status}` }, 502, ctx.allowedOrigin);
    }

    const geocodeRows = await geocodeRes.json();
    const match = Array.isArray(geocodeRows) ? geocodeRows[0] : null;
    const lat = Number(match?.lat);
    const lng = Number(match?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return ctx.jsonResponse({ ok: true, geocoded: false, updated_rows: 0 }, 200, ctx.allowedOrigin);
    }

    const addr = match?.address || {};
    const road = addr.road || addr.pedestrian || addr.footway || addr.path || null;
    const city = addr.city || addr.town || addr.village || addr.hamlet || addr.county || cityHint || null;
    const houseNumber = addr.house_number || null;

    const sessionsTable = await resolveTable(env, ['field_sessions']);
    const streetHint = road ? [houseNumber, road].filter(Boolean).join(' ') : userAddress;
    await buildStatement(
      db,
      `UPDATE ${sessionsTable}
       SET street_hint = COALESCE(?1, street_hint),
           city_hint = COALESCE(?2, city_hint),
           updated_at = datetime('now')
       WHERE id = ?3`,
      [streetHint, city, sessionId]
    ).run();

    let updatedRows = 0;
    const addrTable = await resolveTableOptional(env, ['voters_addr_norm', 'voters_addr', 'voter_addresses']);
    if (addrTable) {
      const cols = await getTableColumns(env, addrTable);
      if (cols.includes('lat') && cols.includes('lng')) {
        const updateResult = await buildStatement(
          db,
          `UPDATE ${addrTable}
           SET lat = ?1,
               lng = ?2,
               geocoded_at = datetime('now')
           WHERE UPPER(addr1) = UPPER(?3)
             AND (?4 = '' OR UPPER(city) = UPPER(?4))
             AND (lat IS NULL OR lng IS NULL)`,
          [lat, lng, userAddress, cityHint || '']
        ).run();
        updatedRows = Number(updateResult?.meta?.changes || 0);
      }
    }

    const updatedSession = await buildStatement(db, `SELECT * FROM ${sessionsTable} WHERE id = ?1`, [sessionId]).first();
    return ctx.jsonResponse(
      {
        ok: true,
        geocoded: true,
        lat,
        lng,
        street_hint: streetHint,
        city_hint: city,
        updated_rows: updatedRows,
        session: updatedSession,
      },
      200,
      ctx.allowedOrigin
    );
  } catch (err) {
    if (err instanceof DependencyMissingError) return missingTableResponse(err.table, ctx.allowedOrigin);
    const status = Number.isInteger(err?.status) ? err.status : 500;
    console.error('/field-sessions/:id/nearby-address-hint error', { status, error: String(err?.message || err) });
    return ctx.jsonResponse({ ok: false, error: String(err?.message || err) }, status, ctx.allowedOrigin);
  }
});

router.post('/field-sessions/:id/stop-sharing', async (request, env, ctx) => {
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    const db = getDb(env);
    if (!db) return missingTableResponse('field_sessions', ctx.allowedOrigin);
    const table = await resolveTable(env, ['field_sessions']);
    const sessionId = Number(getPathSegmentAfter(new URL(request.url).pathname, 'field-sessions'));
    const session = await getFieldSessionForOwner(db, sessionId, auth.email || '');
    if (!session) {
      return ctx.jsonResponse({ ok: false, error: 'field session not found' }, 404, ctx.allowedOrigin);
    }
    await buildStatement(
      db,
      `UPDATE ${table}
       SET sharing_enabled = 0,
           latest_lat = NULL,
           latest_lng = NULL,
           latest_accuracy_m = NULL,
           latest_location_at = NULL,
           stopped_sharing_at = datetime('now'),
           updated_at = datetime('now')
       WHERE id = ?1`,
      [sessionId]
    ).run();
    const updated = await buildStatement(db, `SELECT * FROM ${table} WHERE id = ?1`, [sessionId]).first();
    return ctx.jsonResponse({ ok: true, session: updated }, 200, ctx.allowedOrigin);
  } catch (err) {
    if (err instanceof DependencyMissingError) return missingTableResponse(err.table, ctx.allowedOrigin);
    console.error('/field-sessions/:id/stop-sharing error', err);
    return ctx.jsonResponse({ ok: false, error: String(err?.message || err) }, 500, ctx.allowedOrigin);
  }
});

router.post('/field-sessions/:id/end', async (request, env, ctx) => {
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    const db = getDb(env);
    if (!db) return missingTableResponse('field_sessions', ctx.allowedOrigin);
    const table = await resolveTable(env, ['field_sessions']);
    const sessionId = Number(getPathSegmentAfter(new URL(request.url).pathname, 'field-sessions'));
    const session = await getFieldSessionForOwner(db, sessionId, auth.email || '');
    if (!session) {
      return ctx.jsonResponse({ ok: false, error: 'field session not found' }, 404, ctx.allowedOrigin);
    }
    await buildStatement(
      db,
      `UPDATE ${table}
       SET status = 'ended',
           sharing_enabled = 0,
           latest_lat = NULL,
           latest_lng = NULL,
           latest_accuracy_m = NULL,
           latest_location_at = NULL,
           ended_at = datetime('now'),
           updated_at = datetime('now')
       WHERE id = ?1`,
      [sessionId]
    ).run();
    return ctx.jsonResponse({ ok: true }, 200, ctx.allowedOrigin);
  } catch (err) {
    if (err instanceof DependencyMissingError) return missingTableResponse(err.table, ctx.allowedOrigin);
    console.error('/field-sessions/:id/end error', err);
    return ctx.jsonResponse({ ok: false, error: String(err?.message || err) }, 500, ctx.allowedOrigin);
  }
});

router.get('/admin/field-sessions', async (request, env, ctx) => {
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    requireAdmin(auth.email, env);
    const scope = getSupportScope(auth.email, env);
    const db = getDb(env);
    if (!db) return missingTableResponse('field_sessions', ctx.allowedOrigin);
    const sessionsTable = await resolveTable(env, ['field_sessions']);
    const tasksTable = await resolveTableOptional(env, ['field_session_tasks']);
    const url = new URL(request.url);
    const includeEnded = url.searchParams.get('include_ended') === 'true';
    const requestedTeamId = normalizeTeamId(url.searchParams.get('team_id'));

    if (requestedTeamId && !hasTeamAccess(scope, requestedTeamId)) {
      return ctx.jsonResponse({ ok: false, error: 'team scope denied' }, 403, ctx.allowedOrigin);
    }

    const baseWhere = [];
    const baseParams = [];
    if (!includeEnded) {
      baseWhere.push("status = 'active'");
    }
    const scopeClause = buildTeamScopeWhere(scope, baseParams);
    if (scopeClause) baseWhere.push(scopeClause);

    const finalWhere = [...baseWhere];
    const finalParams = [...baseParams];
    if (requestedTeamId) {
      finalWhere.push(`team_id = ?${finalParams.length + 1}`);
      finalParams.push(requestedTeamId);
    }

    const baseWhereSql = baseWhere.length ? `WHERE ${baseWhere.join(' AND ')}` : '';
    const finalWhereSql = finalWhere.length ? `WHERE ${finalWhere.join(' AND ')}` : '';

    const sessionsResult = await buildStatement(
      db,
      `SELECT *
       FROM ${sessionsTable}
       ${finalWhereSql}
       ORDER BY status ASC, latest_location_at DESC, started_at DESC
       LIMIT 100`,
      finalParams
    ).all();
    const sessions = sessionsResult.results || [];

    const teamsResult = await buildStatement(
      db,
      `SELECT DISTINCT team_id
       FROM ${sessionsTable}
       ${baseWhereSql}
         ${baseWhereSql ? 'AND' : 'WHERE'} team_id IS NOT NULL
       ORDER BY team_id ASC`,
      baseParams
    ).all();
    const availableTeams = (teamsResult.results || []).map(row => row.team_id).filter(Boolean);

    let tasksBySession = new Map();
    if (tasksTable && sessions.length) {
      const ids = sessions.map(session => session.id);
      const placeholders = ids.map((_, index) => `?${index + 1}`).join(',');
      const tasksResult = await buildStatement(
        db,
        `SELECT *
         FROM ${tasksTable}
         WHERE session_id IN (${placeholders})
         ORDER BY created_at DESC, id DESC`,
        ids
      ).all();
      for (const task of tasksResult.results || []) {
        const list = tasksBySession.get(task.session_id) || [];
        list.push(task);
        tasksBySession.set(task.session_id, list);
      }
    }

    return ctx.jsonResponse(
      {
        ok: true,
        available_teams: availableTeams,
        sessions: sessions.map(session => ({
          ...session,
          tasks: tasksBySession.get(session.id) || [],
        })),
      },
      200,
      ctx.allowedOrigin
    );
  } catch (err) {
    if (err instanceof DependencyMissingError) return missingTableResponse(err.table, ctx.allowedOrigin);
    console.error('/admin/field-sessions error', err);
    return ctx.jsonResponse({ ok: false, error: String(err?.message || err) }, 500, ctx.allowedOrigin);
  }
});

router.get('/admin/field-sessions/:id/nearby-voters', async (request, env, ctx) => {
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    requireAdmin(auth.email, env);
    const scope = getSupportScope(auth.email, env);
    const db = getDb(env);
    if (!db) return missingTableResponse('field_sessions', ctx.allowedOrigin);

    const sessionsTable = await resolveTable(env, ['field_sessions']);
    const sessionId = Number(getPathSegmentAfter(new URL(request.url).pathname, 'field-sessions'));
    const session = await buildStatement(db, `SELECT * FROM ${sessionsTable} WHERE id = ?1`, [sessionId]).first();
    if (!session) return ctx.jsonResponse({ ok: false, error: 'field session not found' }, 404, ctx.allowedOrigin);
    if (!hasTeamAccess(scope, session.team_id)) {
      return ctx.jsonResponse({ ok: false, error: 'team scope denied' }, 403, ctx.allowedOrigin);
    }

    const streetHint = session.street_hint;
    const cityHint = session.city_hint;
    const sessionLat = Number.isFinite(Number(session.latest_lat)) ? Number(session.latest_lat) : null;
    const sessionLng = Number.isFinite(Number(session.latest_lng)) ? Number(session.latest_lng) : null;

    // No street hint and no GPS — nothing to search on
    if (!streetHint && (sessionLat === null || sessionLng === null)) {
      return ctx.jsonResponse(
        { ok: true, rows: [], has_phone: 0, no_phone: 0, street_used: null, street_index_id: null, method: null },
        200,
        ctx.allowedOrigin
      );
    }

    const votersTable = await resolveTable(env, ['voters']);
    const addrTable = await resolveTable(env, ['voters_addr_norm', 'voters_addr', 'voter_addresses']);
    const phoneTable = await resolveTableOptional(env, ['best_phone', 'voter_phones', 'v_best_phone', 'best_phone_view']);

    const phoneJoin = phoneTable ? `LEFT JOIN ${phoneTable} bp ON v.voter_id = bp.voter_id` : '';
    const phoneExpr = phoneTable ? `NULLIF(bp.phone_e164, '')` : 'NULL';

    const addrColumns = await getTableColumns(env, addrTable);
    const fnExpr = addrColumns.includes('fn') ? "COALESCE(va.fn, '')" : addrColumns.includes('first_name') ? "COALESCE(va.first_name, '')" : "''";
    const lnExpr = addrColumns.includes('ln') ? "COALESCE(va.ln, '')" : addrColumns.includes('last_name') ? "COALESCE(va.last_name, '')" : "''";
    const hasVoterCoords = addrColumns.includes('lat') && addrColumns.includes('lng');

    let query;
    let params;
    let method;
    let streetIndexId = null;

    if (streetHint) {
      // Primary: resolve canonical street_index_id for precise indexed lookup
      try {
        const streetsTable = await resolveTableOptional(env, ['streets_index']);
        const cityCountyTable = await resolveTableOptional(env, ['wy_city_county']);
        if (streetsTable) {
          let streetRow;
          if (cityHint && cityCountyTable) {
            streetRow = await buildStatement(
              db,
              `SELECT si.id FROM ${streetsTable} si
               JOIN ${cityCountyTable} cc ON si.city_county_id = cc.id
               WHERE UPPER(si.street_canonical) = UPPER(?1)
                 AND UPPER(cc.city) = UPPER(?2)
               LIMIT 1`,
              [streetHint, cityHint]
            ).first();
          } else {
            streetRow = await buildStatement(
              db,
              `SELECT id FROM ${streetsTable} WHERE UPPER(street_canonical) = UPPER(?1) LIMIT 1`,
              [streetHint]
            ).first();
          }
          if (streetRow) streetIndexId = streetRow.id;
        }
      } catch {
        // streets_index lookup is optional; fall through to name match
      }

      if (streetIndexId !== null) {
        method = 'street_id';
        query = `
          SELECT v.voter_id,
                 ${fnExpr} AS first_name,
                 ${lnExpr} AS last_name,
                 COALESCE(va.addr1, '') AS address,
                 COALESCE(va.city, '') AS city,
                 COALESCE(va.zip, '') AS zip,
                 ${phoneExpr} AS phone_e164
          FROM ${votersTable} v
          LEFT JOIN ${addrTable} va ON v.voter_id = va.voter_id
          ${phoneJoin}
          WHERE va.street_index_id = ?1
          ORDER BY CASE WHEN ${phoneExpr} IS NULL THEN 1 ELSE 0 END ASC, va.addr1 ASC
          LIMIT 50`;
        params = [streetIndexId];
      } else {
        method = 'street_name';
        query = `
          SELECT v.voter_id,
                 ${fnExpr} AS first_name,
                 ${lnExpr} AS last_name,
                 COALESCE(va.addr1, '') AS address,
                 COALESCE(va.city, '') AS city,
                 COALESCE(va.zip, '') AS zip,
                 ${phoneExpr} AS phone_e164
          FROM ${votersTable} v
          LEFT JOIN ${addrTable} va ON v.voter_id = va.voter_id
          ${phoneJoin}
          WHERE UPPER(va.addr1) LIKE '%' || ?1 || '%'
            ${cityHint ? 'AND UPPER(va.city) = ?2' : ''}
          ORDER BY CASE WHEN ${phoneExpr} IS NULL THEN 1 ELSE 0 END ASC, va.addr1 ASC
          LIMIT 50`;
        params = cityHint ? [streetHint.toUpperCase(), cityHint.toUpperCase()] : [streetHint.toUpperCase()];
      }
    } else if (hasVoterCoords && sessionLat !== null && sessionLng !== null) {
      // Fallback: GPS bounding-box using geocoded voter coordinates (populated by canvass contacts).
      // ±0.003 lat ≈ ±333m; ±0.004 lng ≈ ±333m at Wyoming latitude (~43°, cos≈0.731)
      method = 'coordinates';
      const latDelta = 0.003;
      const lngDelta = 0.004;
      query = `
        SELECT v.voter_id,
               ${fnExpr} AS first_name,
               ${lnExpr} AS last_name,
               COALESCE(va.addr1, '') AS address,
               COALESCE(va.city, '') AS city,
               COALESCE(va.zip, '') AS zip,
               ${phoneExpr} AS phone_e164,
               va.lat,
               va.lng
        FROM ${votersTable} v
        LEFT JOIN ${addrTable} va ON v.voter_id = va.voter_id
        ${phoneJoin}
        WHERE va.lat IS NOT NULL
          AND va.lat BETWEEN ?1 AND ?2
          AND va.lng BETWEEN ?3 AND ?4
        ORDER BY CASE WHEN ${phoneExpr} IS NULL THEN 1 ELSE 0 END ASC,
                 ((va.lat - ?5) * (va.lat - ?5) + (va.lng - ?6) * (va.lng - ?6)) ASC
        LIMIT 50`;
      params = [
        sessionLat - latDelta, sessionLat + latDelta,
        sessionLng - lngDelta, sessionLng + lngDelta,
        sessionLat, sessionLng,
      ];
    } else {
      // No voter coordinates in DB yet (migration 031 not yet populated)
      return ctx.jsonResponse(
        { ok: true, rows: [], has_phone: 0, no_phone: 0, street_used: null, street_index_id: null, method: 'coordinates_pending' },
        200,
        ctx.allowedOrigin
      );
    }

    const result = await buildStatement(db, query, params).all();
    const rows = (result.results || []).map(row => ({
      voter_id: row.voter_id,
      first_name: row.first_name || '',
      last_name: row.last_name || '',
      address: row.address || '',
      city: row.city || '',
      zip: row.zip || '',
      phone_e164: row.phone_e164 || null,
    }));

    const has_phone = rows.filter(r => r.phone_e164).length;
    const no_phone = rows.length - has_phone;

    return ctx.jsonResponse(
      { ok: true, rows, has_phone, no_phone, street_used: streetHint, street_index_id: streetIndexId, method },
      200,
      ctx.allowedOrigin
    );
  } catch (err) {
    if (err instanceof DependencyMissingError) return missingTableResponse(err.table, ctx.allowedOrigin);
    console.error('/admin/field-sessions/:id/nearby-voters error', err);
    return ctx.jsonResponse({ ok: false, error: String(err?.message || err) }, 500, ctx.allowedOrigin);
  }
});

router.post('/admin/field-sessions/:id/geocode-street', async (request, env, ctx) => {
  let body = {};
  try {
    body = await readJson(request);
  } catch (err) {
    if (!(err instanceof BadRequestError)) throw err;
  }

  try {
    const auth = await ensureAuth(request, env, ctx.config);
    requireAdmin(auth.email, env);
    const scope = getSupportScope(auth.email, env);
    const db = getDb(env);
    if (!db) return missingTableResponse('field_sessions', ctx.allowedOrigin);

    const sessionsTable = await resolveTable(env, ['field_sessions']);
    const addrTable = await resolveTable(env, ['voters_addr_norm', 'voters_addr', 'voter_addresses']);
    const addrColumns = await getTableColumns(env, addrTable);
    if (!addrColumns.includes('lat') || !addrColumns.includes('lng')) {
      return ctx.jsonResponse({ ok: false, error: 'address table does not support coordinates' }, 400, ctx.allowedOrigin);
    }

    const sessionId = Number(getPathSegmentAfter(new URL(request.url).pathname, 'field-sessions'));
    const session = await buildStatement(db, `SELECT * FROM ${sessionsTable} WHERE id = ?1`, [sessionId]).first();
    if (!session) return ctx.jsonResponse({ ok: false, error: 'field session not found' }, 404, ctx.allowedOrigin);
    if (!hasTeamAccess(scope, session.team_id)) {
      return ctx.jsonResponse({ ok: false, error: 'team scope denied' }, 403, ctx.allowedOrigin);
    }

    const streetRaw = String(session.street_hint || '').trim();
    const cityHint = String(session.city_hint || '').trim();
    if (!streetRaw) {
      return ctx.jsonResponse({ ok: false, error: 'street hint is required on session' }, 400, ctx.allowedOrigin);
    }

    const streetToken = streetRaw
      .replace(/^\d{1,6}\s+/, '')
      .replace(/\b(street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|court|ct|place|pl)\b/gi, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .find(part => part.length >= 3);

    if (!streetToken) {
      return ctx.jsonResponse({ ok: false, error: 'unable to parse street token' }, 400, ctx.allowedOrigin);
    }

    const requestedLimit = Number(body?.limit);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.floor(requestedLimit), 1), 3) : 2;

    const candidatesResult = await buildStatement(
      db,
      `SELECT voter_id, COALESCE(addr1, '') AS addr1, COALESCE(city, '') AS city, COALESCE(state, 'WY') AS state
       FROM ${addrTable}
       WHERE UPPER(addr1) LIKE '%' || UPPER(?1) || '%'
         AND (?2 = '' OR UPPER(city) = UPPER(?2))
         AND (lat IS NULL OR lng IS NULL)
       ORDER BY addr1 ASC
       LIMIT ${limit}`,
      [streetToken, cityHint]
    ).all();

    const candidates = candidatesResult.results || [];
    if (!candidates.length) {
      return ctx.jsonResponse({ ok: true, attempted: 0, updated: 0, failed: 0, message: 'No unresolved street rows found' }, 200, ctx.allowedOrigin);
    }

    let attempted = 0;
    let updated = 0;
    let failed = 0;

    for (const row of candidates) {
      attempted += 1;
      const query = `${row.addr1}, ${row.city || cityHint || ''}, ${row.state || 'WY'}`.replace(/\s+,/g, ',').replace(/,+/g, ',').trim();
      try {
        const geoUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=${encodeURIComponent(query)}`;
        const geoRes = await fetch(geoUrl, {
          headers: {
            'Accept-Language': 'en',
            'User-Agent': 'grassrootsmvt-admin-geocoder/1.0',
          },
        });
        if (!geoRes.ok) {
          failed += 1;
          continue;
        }
        const geoRows = await geoRes.json();
        const match = Array.isArray(geoRows) ? geoRows[0] : null;
        const lat = Number(match?.lat);
        const lng = Number(match?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          failed += 1;
          continue;
        }
        await buildStatement(
          db,
          `UPDATE ${addrTable}
           SET lat = ?1,
               lng = ?2,
               geocoded_at = datetime('now')
           WHERE voter_id = ?3`,
          [lat, lng, row.voter_id]
        ).run();
        updated += 1;
      } catch {
        failed += 1;
      }
    }

    return ctx.jsonResponse(
      {
        ok: true,
        attempted,
        updated,
        failed,
        street_token: streetToken,
        city: cityHint || null,
      },
      200,
      ctx.allowedOrigin
    );
  } catch (err) {
    if (err instanceof DependencyMissingError) return missingTableResponse(err.table, ctx.allowedOrigin);
    const status = Number.isInteger(err?.status) ? err.status : 500;
    console.error('/admin/field-sessions/:id/geocode-street error', { status, error: String(err?.message || err) });
    return ctx.jsonResponse({ ok: false, error: String(err?.message || err) }, status, ctx.allowedOrigin);
  }
});

router.post('/admin/field-sessions/:id/tasks', async (request, env, ctx) => {
  let body;
  try {
    body = await readJson(request);
  } catch (err) {
    if (err instanceof BadRequestError) return ctx.jsonResponse({ ok: false, error: err.message }, err.status, ctx.allowedOrigin);
    throw err;
  }
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    requireAdmin(auth.email, env);
    const scope = getSupportScope(auth.email, env);
    const db = getDb(env);
    if (!db) return missingTableResponse('field_session_tasks', ctx.allowedOrigin);
    const sessionsTable = await resolveTable(env, ['field_sessions']);
    const tasksTable = await resolveTable(env, ['field_session_tasks']);
    const tasksColumns = await getTableColumns(env, tasksTable);
    const hasTaskTeam = tasksColumns.includes('team_id');
    const hasAssignee = tasksColumns.includes('assigned_support_email');
    const hasPriority = tasksColumns.includes('priority');
    const hasDueAt = tasksColumns.includes('due_at');
    const hasVersion = tasksColumns.includes('version');
    const sessionId = Number(getPathSegmentAfter(new URL(request.url).pathname, 'field-sessions'));
    const session = await buildStatement(db, `SELECT id, team_id FROM ${sessionsTable} WHERE id = ?1`, [sessionId]).first();
    if (!session) {
      return ctx.jsonResponse({ ok: false, error: 'field session not found' }, 404, ctx.allowedOrigin);
    }
    if (!hasTeamAccess(scope, session.team_id)) {
      return ctx.jsonResponse({ ok: false, error: 'team scope denied' }, 403, ctx.allowedOrigin);
    }
    const taskType = normalizeFieldTaskType(body?.task_type || body?.type);
    const title = String(body?.title || '').trim();
    const notes = body?.notes ? String(body.notes).trim() : null;
    const scheduledFor = body?.scheduled_for ? String(body.scheduled_for).trim() : null;
    const teamId = normalizeTeamId(body?.team_id) || normalizeTeamId(session.team_id);
    if (teamId && !hasTeamAccess(scope, teamId)) {
      return ctx.jsonResponse({ ok: false, error: 'team scope denied' }, 403, ctx.allowedOrigin);
    }
    const assignedSupportEmail = hasAssignee && body?.assigned_support_email
      ? String(body.assigned_support_email).trim().toLowerCase()
      : null;
    const priority = hasPriority && body?.priority ? String(body.priority).trim().toLowerCase() : (hasPriority ? 'normal' : null);
    const dueAt = hasDueAt && body?.due_at ? String(body.due_at).trim() : null;
    if (!title) {
      return ctx.jsonResponse({ ok: false, error: 'title is required' }, 400, ctx.allowedOrigin);
    }

    const insertColumns = ['session_id', 'task_type', 'status', 'title', 'notes', 'scheduled_for', 'created_by'];
    const insertValues = [sessionId, taskType, normalizeFieldTaskStatus(body?.status), title, notes, scheduledFor, auth.email || null];
    if (hasTaskTeam) {
      insertColumns.push('team_id');
      insertValues.push(teamId);
    }
    if (hasAssignee) {
      insertColumns.push('assigned_support_email');
      insertValues.push(assignedSupportEmail);
    }
    if (hasPriority) {
      insertColumns.push('priority');
      insertValues.push(priority || 'normal');
    }
    if (hasDueAt) {
      insertColumns.push('due_at');
      insertValues.push(dueAt);
    }
    if (hasVersion) {
      insertColumns.push('version');
      insertValues.push(1);
    }

    const placeholders = insertColumns.map((_, index) => `?${index + 1}`).join(', ');
    const result = await buildStatement(
      db,
      `INSERT INTO ${tasksTable} (${insertColumns.join(', ')})
       VALUES (${placeholders})`,
      insertValues
    ).run();
    const task = await buildStatement(db, `SELECT * FROM ${tasksTable} WHERE id = ?1`, [result?.meta?.last_row_id]).first();
    return ctx.jsonResponse({ ok: true, task }, 201, ctx.allowedOrigin);
  } catch (err) {
    if (err instanceof DependencyMissingError) return missingTableResponse(err.table, ctx.allowedOrigin);
    console.error('/admin/field-sessions/:id/tasks error', err);
    return ctx.jsonResponse({ ok: false, error: String(err?.message || err) }, 500, ctx.allowedOrigin);
  }
});

router.patch('/admin/field-session-tasks/:id', async (request, env, ctx) => {
  let body;
  try {
    body = await readJson(request);
  } catch (err) {
    if (err instanceof BadRequestError) return ctx.jsonResponse({ ok: false, error: err.message }, err.status, ctx.allowedOrigin);
    throw err;
  }
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    requireAdmin(auth.email, env);
    const scope = getSupportScope(auth.email, env);
    const db = getDb(env);
    if (!db) return missingTableResponse('field_session_tasks', ctx.allowedOrigin);
    const tasksTable = await resolveTable(env, ['field_session_tasks']);
    const taskColumns = await getTableColumns(env, tasksTable);
    const hasVersion = taskColumns.includes('version');
    const taskId = Number(getPathSegmentAfter(new URL(request.url).pathname, 'field-session-tasks'));
    if (!Number.isFinite(taskId)) {
      return ctx.jsonResponse({ ok: false, error: 'task id is required' }, 400, ctx.allowedOrigin);
    }

    const currentTask = await getFieldTaskForScope(db, tasksTable, taskId, scope);
    if (!currentTask) {
      return ctx.jsonResponse({ ok: false, error: 'task not found' }, 404, ctx.allowedOrigin);
    }

    if (hasVersion && body?.expected_version !== undefined) {
      assertExpectedVersion(currentTask, body.expected_version);
    }

    const updates = [];
    const params = [];
    let paramIndex = 1;
    if (body?.status !== undefined) {
      const status = normalizeFieldTaskStatus(body.status);
      updates.push(`status = ?${paramIndex++}`);
      params.push(status);
      updates.push(`completed_at = ${status === 'done' ? "datetime('now')" : 'NULL'}`);
    }
    if (body?.title !== undefined) {
      updates.push(`title = ?${paramIndex++}`);
      params.push(String(body.title || '').trim());
    }
    if (body?.notes !== undefined) {
      updates.push(`notes = ?${paramIndex++}`);
      params.push(body.notes ? String(body.notes).trim() : null);
    }
    if (body?.scheduled_for !== undefined) {
      updates.push(`scheduled_for = ?${paramIndex++}`);
      params.push(body.scheduled_for ? String(body.scheduled_for).trim() : null);
    }
    if (taskColumns.includes('assigned_support_email') && body?.assigned_support_email !== undefined) {
      updates.push(`assigned_support_email = ?${paramIndex++}`);
      params.push(body.assigned_support_email ? String(body.assigned_support_email).trim().toLowerCase() : null);
    }
    if (taskColumns.includes('priority') && body?.priority !== undefined) {
      updates.push(`priority = ?${paramIndex++}`);
      params.push(body.priority ? String(body.priority).trim().toLowerCase() : 'normal');
    }
    if (taskColumns.includes('due_at') && body?.due_at !== undefined) {
      updates.push(`due_at = ?${paramIndex++}`);
      params.push(body.due_at ? String(body.due_at).trim() : null);
    }
    if (!updates.length) {
      return ctx.jsonResponse({ ok: false, error: 'No updates provided' }, 400, ctx.allowedOrigin);
    }
    if (hasVersion) {
      updates.push(`version = COALESCE(version, 1) + 1`);
    }
    updates.push(`updated_at = datetime('now')`);
    params.push(taskId);
    await buildStatement(
      db,
      `UPDATE ${tasksTable}
       SET ${updates.join(', ')}
       WHERE id = ?${paramIndex}`,
      params
    ).run();
    const task = await buildStatement(db, `SELECT * FROM ${tasksTable} WHERE id = ?1`, [taskId]).first();
    if (!task) return ctx.jsonResponse({ ok: false, error: 'task not found' }, 404, ctx.allowedOrigin);
    return ctx.jsonResponse({ ok: true, task }, 200, ctx.allowedOrigin);
  } catch (err) {
    if (err instanceof DependencyMissingError) return missingTableResponse(err.table, ctx.allowedOrigin);
    if (err?.status === 409 && err?.payload) {
      return ctx.jsonResponse(err.payload, 409, ctx.allowedOrigin);
    }
    if (err?.status === 403) {
      return ctx.jsonResponse({ ok: false, error: String(err?.message || err) }, 403, ctx.allowedOrigin);
    }
    console.error('/admin/field-session-tasks/:id error', err);
    return ctx.jsonResponse({ ok: false, error: String(err?.message || err) }, 500, ctx.allowedOrigin);
  }
});

router.post('/admin/field-session-tasks/:id/claim', async (request, env, ctx) => {
  let body;
  try {
    body = await readJson(request);
  } catch (err) {
    if (err instanceof BadRequestError) return ctx.jsonResponse({ ok: false, error: err.message }, err.status, ctx.allowedOrigin);
    throw err;
  }
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    requireAdmin(auth.email, env);
    const scope = getSupportScope(auth.email, env);
    const db = getDb(env);
    if (!db) return missingTableResponse('field_session_tasks', ctx.allowedOrigin);
    const tasksTable = await resolveTable(env, ['field_session_tasks']);
    const taskColumns = await getTableColumns(env, tasksTable);
    const taskId = Number(getPathSegmentAfter(new URL(request.url).pathname, 'field-session-tasks'));
    if (!Number.isFinite(taskId)) {
      return ctx.jsonResponse({ ok: false, error: 'task id is required' }, 400, ctx.allowedOrigin);
    }
    const task = await getFieldTaskForScope(db, tasksTable, taskId, scope);
    if (!task) {
      return ctx.jsonResponse({ ok: false, error: 'task not found' }, 404, ctx.allowedOrigin);
    }
    if (!taskColumns.includes('assigned_support_email') || !taskColumns.includes('version')) {
      return ctx.jsonResponse({ ok: false, error: 'task claiming unavailable' }, 400, ctx.allowedOrigin);
    }
    assertExpectedVersion(task, body?.expected_version);
    const actorEmail = String(auth.email || '').trim().toLowerCase();
    const currentAssignee = String(task.assigned_support_email || '').trim().toLowerCase();
    if (currentAssignee && currentAssignee !== actorEmail) {
      return ctx.jsonResponse(
        { ok: false, error: 'task already claimed', assigned_support_email: currentAssignee, current_version: Number(task.version || 1) },
        409,
        ctx.allowedOrigin
      );
    }
    const updatedTask = await updateFieldTaskRow(
      db,
      tasksTable,
      taskId,
      [
        `assigned_support_email = ?1`,
        `status = ?2`,
        `completed_at = NULL`,
        `version = COALESCE(version, 1) + 1`
      ],
      [actorEmail, 'claimed']
    );
    return ctx.jsonResponse({ ok: true, task: updatedTask }, 200, ctx.allowedOrigin);
  } catch (err) {
    if (err instanceof DependencyMissingError) return missingTableResponse(err.table, ctx.allowedOrigin);
    if (err?.status === 409 && err?.payload) {
      return ctx.jsonResponse(err.payload, 409, ctx.allowedOrigin);
    }
    if (err?.status === 403) {
      return ctx.jsonResponse({ ok: false, error: String(err?.message || err) }, 403, ctx.allowedOrigin);
    }
    console.error('/admin/field-session-tasks/:id/claim error', err);
    return ctx.jsonResponse({ ok: false, error: String(err?.message || err) }, 500, ctx.allowedOrigin);
  }
});

router.post('/admin/field-session-tasks/:id/release', async (request, env, ctx) => {
  let body;
  try {
    body = await readJson(request);
  } catch (err) {
    if (err instanceof BadRequestError) return ctx.jsonResponse({ ok: false, error: err.message }, err.status, ctx.allowedOrigin);
    throw err;
  }
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    requireAdmin(auth.email, env);
    const scope = getSupportScope(auth.email, env);
    const db = getDb(env);
    if (!db) return missingTableResponse('field_session_tasks', ctx.allowedOrigin);
    const tasksTable = await resolveTable(env, ['field_session_tasks']);
    const taskColumns = await getTableColumns(env, tasksTable);
    const taskId = Number(getPathSegmentAfter(new URL(request.url).pathname, 'field-session-tasks'));
    if (!Number.isFinite(taskId)) {
      return ctx.jsonResponse({ ok: false, error: 'task id is required' }, 400, ctx.allowedOrigin);
    }
    const task = await getFieldTaskForScope(db, tasksTable, taskId, scope);
    if (!task) {
      return ctx.jsonResponse({ ok: false, error: 'task not found' }, 404, ctx.allowedOrigin);
    }
    if (!taskColumns.includes('assigned_support_email') || !taskColumns.includes('version')) {
      return ctx.jsonResponse({ ok: false, error: 'task release unavailable' }, 400, ctx.allowedOrigin);
    }
    assertExpectedVersion(task, body?.expected_version);
    const updatedTask = await updateFieldTaskRow(
      db,
      tasksTable,
      taskId,
      [
        `assigned_support_email = NULL`,
        `status = ?1`,
        `completed_at = NULL`,
        `version = COALESCE(version, 1) + 1`
      ],
      ['open']
    );
    return ctx.jsonResponse({ ok: true, task: updatedTask }, 200, ctx.allowedOrigin);
  } catch (err) {
    if (err instanceof DependencyMissingError) return missingTableResponse(err.table, ctx.allowedOrigin);
    if (err?.status === 409 && err?.payload) {
      return ctx.jsonResponse(err.payload, 409, ctx.allowedOrigin);
    }
    if (err?.status === 403) {
      return ctx.jsonResponse({ ok: false, error: String(err?.message || err) }, 403, ctx.allowedOrigin);
    }
    console.error('/admin/field-session-tasks/:id/release error', err);
    return ctx.jsonResponse({ ok: false, error: String(err?.message || err) }, 500, ctx.allowedOrigin);
  }
});

router.post('/admin/field-session-tasks/:id/reassign', async (request, env, ctx) => {
  let body;
  try {
    body = await readJson(request);
  } catch (err) {
    if (err instanceof BadRequestError) return ctx.jsonResponse({ ok: false, error: err.message }, err.status, ctx.allowedOrigin);
    throw err;
  }
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    requireAdmin(auth.email, env);
    const scope = getSupportScope(auth.email, env);
    const db = getDb(env);
    if (!db) return missingTableResponse('field_session_tasks', ctx.allowedOrigin);
    const tasksTable = await resolveTable(env, ['field_session_tasks']);
    const taskColumns = await getTableColumns(env, tasksTable);
    const taskId = Number(getPathSegmentAfter(new URL(request.url).pathname, 'field-session-tasks'));
    if (!Number.isFinite(taskId)) {
      return ctx.jsonResponse({ ok: false, error: 'task id is required' }, 400, ctx.allowedOrigin);
    }
    const task = await getFieldTaskForScope(db, tasksTable, taskId, scope);
    if (!task) {
      return ctx.jsonResponse({ ok: false, error: 'task not found' }, 404, ctx.allowedOrigin);
    }
    if (!taskColumns.includes('assigned_support_email') || !taskColumns.includes('version')) {
      return ctx.jsonResponse({ ok: false, error: 'task reassignment unavailable' }, 400, ctx.allowedOrigin);
    }
    assertExpectedVersion(task, body?.expected_version);
    const assigneeEmail = String(body?.assignee_email || body?.assigned_support_email || '').trim().toLowerCase();
    if (!assigneeEmail) {
      return ctx.jsonResponse({ ok: false, error: 'assignee_email is required' }, 400, ctx.allowedOrigin);
    }
    const updatedTask = await updateFieldTaskRow(
      db,
      tasksTable,
      taskId,
      [
        `assigned_support_email = ?1`,
        `status = ?2`,
        `completed_at = NULL`,
        `version = COALESCE(version, 1) + 1`
      ],
      [assigneeEmail, 'claimed']
    );
    return ctx.jsonResponse({ ok: true, task: updatedTask }, 200, ctx.allowedOrigin);
  } catch (err) {
    if (err instanceof DependencyMissingError) return missingTableResponse(err.table, ctx.allowedOrigin);
    if (err?.status === 409 && err?.payload) {
      return ctx.jsonResponse(err.payload, 409, ctx.allowedOrigin);
    }
    if (err?.status === 403) {
      return ctx.jsonResponse({ ok: false, error: String(err?.message || err) }, 403, ctx.allowedOrigin);
    }
    console.error('/admin/field-session-tasks/:id/reassign error', err);
    return ctx.jsonResponse({ ok: false, error: String(err?.message || err) }, 500, ctx.allowedOrigin);
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

router.get('/admin/call-activity', async (request, env, ctx) => {
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    requireAdmin(auth.email, env);

    const db = getDb(env);
    if (!db) {
      return missingTableResponse('call_activity', ctx.allowedOrigin);
    }

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 500);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const resultFilter = url.searchParams.get('call_result'); // e.g. 'Reached'
    const followupFilter = url.searchParams.get('followup_needed'); // 'true' or 'false'
    const volunteerFilter = url.searchParams.get('volunteer');

    const callTable = await resolveTable(env, ['call_activity', 'call_log', 'calls']);

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (resultFilter) {
      conditions.push(`call_result = ?${paramIndex++}`);
      params.push(resultFilter);
    }
    if (followupFilter === 'true') {
      conditions.push(`followup_needed = 1`);
    } else if (followupFilter === 'false') {
      conditions.push(`(followup_needed = 0 OR followup_needed IS NULL)`);
    }
    if (volunteerFilter) {
      conditions.push(`volunteer_email = ?${paramIndex++}`);
      params.push(volunteerFilter);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await buildStatement(db, `
      SELECT id, voter_id, volunteer_email, call_result, notes,
             pitch_used, pulse_opt_in, followup_needed, followup_date, created_at
      FROM ${callTable}
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ?${paramIndex++} OFFSET ?${paramIndex++}
    `, [...params, limit, offset]).all();

    const total = await buildStatement(db, `
      SELECT COUNT(*) as count FROM ${callTable} ${whereClause}
    `, params).first();

    const summary = await buildStatement(db, `
      SELECT call_result, COUNT(*) as count
      FROM ${callTable}
      WHERE call_result IS NOT NULL
      GROUP BY call_result
      ORDER BY count DESC
    `).all();

    return ctx.jsonResponse(
      {
        ok: true,
        calls: rows?.results || [],
        total: total?.count || 0,
        limit,
        offset,
        by_result: summary?.results || [],
      },
      200,
      ctx.allowedOrigin
    );
  } catch (err) {
    if (err?.status === 403) {
      return ctx.jsonResponse({ ok: false, error: 'Admin access required' }, 403, ctx.allowedOrigin);
    }
    if (err instanceof DependencyMissingError) {
      return missingTableResponse(err.table, ctx.allowedOrigin);
    }
    console.error('/admin/call-activity error', err);
    return ctx.jsonResponse({ ok: false, error: String(err?.message || err) }, 500, ctx.allowedOrigin);
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

router.get('/admin/pulse', async (request, env, ctx) => {
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    requireAdmin(auth.email, env);
    
    const db = getDb(env);
    if (!db) {
      return missingTableResponse('pulse_optins', ctx.allowedOrigin);
    }
    
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '500'), 1000);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    
    const pulseTable = await resolveTable(env, ['pulse_optins', 'pulse']);
    
    const optins = await buildStatement(db, `
      SELECT 
        id,
        voter_id,
        contact_method,
        consent_given,
        consent_source,
        volunteer_email,
        created_at
      FROM ${pulseTable}
      ORDER BY created_at DESC
      LIMIT ?1 OFFSET ?2
    `, [limit, offset]).all();
    
    const total = await buildStatement(db, `
      SELECT COUNT(*) as count FROM ${pulseTable}
    `).first();
    
    return ctx.jsonResponse(
      {
        ok: true,
        optins: optins?.results || [],
        total: total?.count || 0,
        limit,
        offset,
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
    console.error('/admin/pulse error', err);
    return ctx.jsonResponse(
      { ok: false, error: String(err?.message || err) },
      500,
      ctx.allowedOrigin
    );
  }
});

router.delete('/admin/pulse/:id', async (request, env, ctx) => {
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    requireAdmin(auth.email, env);
    
    const db = getDb(env);
    if (!db) {
      return missingTableResponse('pulse_optins', ctx.allowedOrigin);
    }
    
    const url = new URL(request.url);
    const id = url.pathname.split('/').pop();
    
    const pulseTable = await resolveTable(env, ['pulse_optins', 'pulse']);
    
    await buildStatement(db, `
      DELETE FROM ${pulseTable} WHERE id = ?1
    `, [id]).run();
    
    return ctx.jsonResponse(
      { ok: true, message: 'Pulse opt-in deleted', id },
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
    console.error('/admin/pulse/:id DELETE error', err);
    return ctx.jsonResponse(
      { ok: false, error: String(err?.message || err) },
      500,
      ctx.allowedOrigin
    );
  }
});

router.get('/admin/touchpoints', async (request, env, ctx) => {
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    requireAdmin(auth.email, env);

    const db = getDb(env);
    if (!db) {
      return missingTableResponse('campaign_touchpoints', ctx.allowedOrigin);
    }

    const touchpointTable = await resolveTable(env, ['campaign_touchpoints']);
    const segmentTable = await resolveTableOptional(env, ['campaign_touchpoint_segments']);

    const result = await buildStatement(
      db,
      `
        SELECT touchpoint_id, label, icebreaker, body, cta_question,
               issue_tag, channels, priority, is_active, metadata,
               created_at, updated_at
        FROM ${touchpointTable}
        ORDER BY priority ASC, updated_at DESC
      `
    ).all();
    const rows = result?.results || [];

    const segmentsById = {};
    if (segmentTable && rows.length) {
      const params = rows.map(row => row.touchpoint_id);
      const placeholders = params.map((_, index) => `?${index + 1}`).join(', ');
      const segmentsResult = await buildStatement(
        db,
        `
          SELECT touchpoint_id, segment_key, segment_value
          FROM ${segmentTable}
          WHERE touchpoint_id IN (${placeholders})
          ORDER BY id ASC
        `,
        params
      ).all();
      for (const entry of segmentsResult?.results || []) {
        const list = segmentsById[entry.touchpoint_id] || [];
        list.push({ segment_key: entry.segment_key, segment_value: entry.segment_value });
        segmentsById[entry.touchpoint_id] = list;
      }
    }

    const payload = rows.map(row => ({
      ...row,
      metadata_raw: row.metadata,
      metadata: parseJsonSafe(row.metadata),
      segments: segmentsById[row.touchpoint_id] || [],
    }));

    return ctx.jsonResponse(
      { ok: true, touchpoints: payload },
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
    console.error('/admin/touchpoints GET error', err);
    return ctx.jsonResponse(
      { ok: false, error: String(err?.message || err) },
      500,
      ctx.allowedOrigin
    );
  }
});

router.post('/admin/touchpoints', async (request, env, ctx) => {
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    requireAdmin(auth.email, env);

    const body = await readJson(request);

    const db = getDb(env);
    if (!db) {
      return missingTableResponse('campaign_touchpoints', ctx.allowedOrigin);
    }

    const touchpointTable = await resolveTable(env, ['campaign_touchpoints']);
    const segmentTable = await resolveTableOptional(env, ['campaign_touchpoint_segments']);

    const touchpointId = body.touchpoint_id
      ? String(body.touchpoint_id).trim()
      : generateTouchpointId(body.label || '');
    const label = String(body.label || '').trim();
    const icebreaker = String(body.icebreaker || '').trim();
    const scriptBody = String(body.body || '').trim();

    if (!touchpointId || !label || !icebreaker || !scriptBody) {
      throw new BadRequestError('touchpoint_id, label, icebreaker, and body are required');
    }

    const metadataValue = serializeMetadataInput(body.metadata ?? body.metadata_raw ?? null);
    const segments = normalizeSegmentsInput(body.segments);

    await buildStatement(
      db,
      `
        INSERT INTO ${touchpointTable} (
          touchpoint_id, label, icebreaker, body, cta_question,
          issue_tag, channels, priority, is_active, metadata
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
      `,
      [
        touchpointId,
        label,
        icebreaker,
        scriptBody,
        body.cta_question || null,
        body.issue_tag || null,
        body.channels || 'phone',
        Number.isFinite(Number(body.priority)) ? Number(body.priority) : 100,
        coerceBooleanFlag(body.is_active, 1),
        metadataValue,
      ]
    ).run();

    await replaceTouchpointSegments(db, segmentTable, touchpointId, segments);

    const saved = await fetchTouchpointById(env, db, touchpointTable, segmentTable, touchpointId);
    return ctx.jsonResponse(
      { ok: true, touchpoint: saved },
      201,
      ctx.allowedOrigin
    );
  } catch (err) {
    if (err instanceof BadRequestError) {
      return ctx.jsonResponse({ ok: false, error: err.message }, err.status, ctx.allowedOrigin);
    }
    if (err?.status === 403) {
      return ctx.jsonResponse(
        { ok: false, error: 'Admin access required' },
        403,
        ctx.allowedOrigin
      );
    }
    if (String(err?.message || '').includes('UNIQUE constraint failed')) {
      return ctx.jsonResponse(
        { ok: false, error: 'Touchpoint ID already exists' },
        409,
        ctx.allowedOrigin
      );
    }
    console.error('/admin/touchpoints POST error', err);
    return ctx.jsonResponse(
      { ok: false, error: String(err?.message || err) },
      500,
      ctx.allowedOrigin
    );
  }
});

router.put('/admin/touchpoints/:id', async (request, env, ctx) => {
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    requireAdmin(auth.email, env);

    const body = await readJson(request);

    const db = getDb(env);
    if (!db) {
      return missingTableResponse('campaign_touchpoints', ctx.allowedOrigin);
    }

    const url = new URL(request.url);
    const id = url.pathname.split('/').pop();
    if (!id) {
      throw new BadRequestError('touchpoint id required');
    }

    const touchpointTable = await resolveTable(env, ['campaign_touchpoints']);
    const segmentTable = await resolveTableOptional(env, ['campaign_touchpoint_segments']);

    const metadataProvided = body.metadata !== undefined || body.metadata_raw !== undefined;
    const metadataValue = metadataProvided
      ? serializeMetadataInput(body.metadata ?? body.metadata_raw ?? null)
      : undefined;

    const allowedFields = {
      label: body.label,
      icebreaker: body.icebreaker,
      body: body.body,
      cta_question: body.cta_question,
      issue_tag: body.issue_tag,
      channels: body.channels,
      priority: body.priority,
      is_active: body.is_active,
    };

    const updates = [];
    const params = [];
    let paramIndex = 1;

    for (const [column, value] of Object.entries(allowedFields)) {
      if (value === undefined) continue;
      if (column === 'priority') {
        updates.push(`priority = ?${paramIndex++}`);
        params.push(Number.isFinite(Number(value)) ? Number(value) : 100);
      } else if (column === 'is_active') {
        updates.push(`is_active = ?${paramIndex++}`);
        params.push(coerceBooleanFlag(value, 1));
      } else {
        updates.push(`${column} = ?${paramIndex++}`);
        params.push(value);
      }
    }

    if (metadataProvided) {
      updates.push(`metadata = ?${paramIndex++}`);
      params.push(metadataValue);
    }

    if (!updates.length && body.segments === undefined) {
      throw new BadRequestError('No updates provided');
    }

    if (updates.length) {
      params.push(id);
      await buildStatement(
        db,
        `
          UPDATE ${touchpointTable}
          SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
          WHERE touchpoint_id = ?${paramIndex}
        `,
        params
      ).run();
    }

    if (body.segments !== undefined) {
      const segments = normalizeSegmentsInput(body.segments);
      await replaceTouchpointSegments(db, segmentTable, id, segments);
    }

    const saved = await fetchTouchpointById(env, db, touchpointTable, segmentTable, id);
    if (!saved) {
      return ctx.jsonResponse(
        { ok: false, error: 'Touchpoint not found' },
        404,
        ctx.allowedOrigin
      );
    }
    return ctx.jsonResponse(
      { ok: true, touchpoint: saved },
      200,
      ctx.allowedOrigin
    );
  } catch (err) {
    if (err instanceof BadRequestError) {
      return ctx.jsonResponse({ ok: false, error: err.message }, err.status, ctx.allowedOrigin);
    }
    if (err?.status === 403) {
      return ctx.jsonResponse(
        { ok: false, error: 'Admin access required' },
        403,
        ctx.allowedOrigin
      );
    }
    console.error('/admin/touchpoints PUT error', err);
    return ctx.jsonResponse(
      { ok: false, error: String(err?.message || err) },
      500,
      ctx.allowedOrigin
    );
  }
});

router.delete('/admin/touchpoints/:id', async (request, env, ctx) => {
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    requireAdmin(auth.email, env);

    const db = getDb(env);
    if (!db) {
      return missingTableResponse('campaign_touchpoints', ctx.allowedOrigin);
    }

    const url = new URL(request.url);
    const id = url.pathname.split('/').pop();
    if (!id) {
      throw new BadRequestError('touchpoint id required');
    }

    const touchpointTable = await resolveTable(env, ['campaign_touchpoints']);
    const segmentTable = await resolveTableOptional(env, ['campaign_touchpoint_segments']);

    await replaceTouchpointSegments(db, segmentTable, id, []);
    await buildStatement(
      db,
      `DELETE FROM ${touchpointTable} WHERE touchpoint_id = ?1`,
      [id]
    ).run();

    return ctx.jsonResponse(
      { ok: true, deleted: id },
      200,
      ctx.allowedOrigin
    );
  } catch (err) {
    if (err instanceof BadRequestError) {
      return ctx.jsonResponse({ ok: false, error: err.message }, err.status, ctx.allowedOrigin);
    }
    if (err?.status === 403) {
      return ctx.jsonResponse(
        { ok: false, error: 'Admin access required' },
        403,
        ctx.allowedOrigin
      );
    }
    console.error('/admin/touchpoints DELETE error', err);
    return ctx.jsonResponse(
      { ok: false, error: String(err?.message || err) },
      500,
      ctx.allowedOrigin
    );
  }
});

router.get('/admin/volunteers', async (request, env, ctx) => {
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    requireAdmin(auth.email, env);

    const db = getDb(env);
    if (!db) {
      return missingTableResponse('volunteers', ctx.allowedOrigin);
    }

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '200'), 500);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const search = (url.searchParams.get('search') || '').trim().toLowerCase();
    const onlyActive = url.searchParams.get('active');

    const volunteerTable = await resolveTable(env, ['volunteers']);
    let whereClause = '1 = 1';
    const params = [];
    let paramIndex = 1;

    if (onlyActive === 'true') {
      whereClause += ` AND is_active = 1`;
    } else if (onlyActive === 'false') {
      whereClause += ` AND is_active = 0`;
    }

    if (search) {
      whereClause += ` AND (
        lower(id) LIKE ?${paramIndex} OR
        lower(name) LIKE ?${paramIndex} OR
        lower(first_name) LIKE ?${paramIndex} OR
        lower(last_name) LIKE ?${paramIndex} OR
        replace(cell_phone, '+', '') LIKE ?${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex += 1;
    }

    const volunteers = await buildStatement(
      db,
      `
        SELECT id, name, first_name, last_name, cell_phone, is_active
        FROM ${volunteerTable}
        WHERE ${whereClause}
        ORDER BY is_active DESC, COALESCE(last_name, name), COALESCE(first_name, id)
        LIMIT ?${paramIndex} OFFSET ?${paramIndex + 1}
      `,
      [...params, limit, offset]
    ).all();

    const total = await buildStatement(
      db,
      `
        SELECT COUNT(*) as count
        FROM ${volunteerTable}
        WHERE ${whereClause}
      `,
      params
    ).first();

    return ctx.jsonResponse(
      {
        ok: true,
        volunteers: volunteers?.results || [],
        total: total?.count || 0,
        limit,
        offset,
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
    console.error('/admin/volunteers GET error', err);
    return ctx.jsonResponse(
      { ok: false, error: String(err?.message || err) },
      500,
      ctx.allowedOrigin
    );
  }
});

router.post('/admin/volunteers', async (request, env, ctx) => {
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    requireAdmin(auth.email, env);

    const body = await readJson(request);

    const db = getDb(env);
    if (!db) {
      return missingTableResponse('volunteers', ctx.allowedOrigin);
    }

    const volunteerTable = await resolveTable(env, ['volunteers']);

    const id = String(body.id || '').trim().toLowerCase();
    const firstName = body.first_name ? String(body.first_name).trim() : null;
    const lastName = body.last_name ? String(body.last_name).trim() : null;
    const displayName = String(body.name || '').trim() || buildVolunteerName(firstName, lastName, id);
    const cellPhone = normalizeCellPhone(body.cell_phone || '');
    const state = body.state ? String(body.state).trim().toUpperCase() : null;
    const city = body.city ? String(body.city).trim().toUpperCase() : null;
    const isActive = coerceBooleanFlag(body.is_active, 1);

    if (!id || !displayName) {
      throw new BadRequestError('id and name are required');
    }

    // Check if volunteer already exists (case-insensitive)
    const existing = await fetchVolunteerById(env, db, volunteerTable, id);
    if (existing) {
      return ctx.jsonResponse(
        { ok: false, error: 'Volunteer already exists' },
        409,
        ctx.allowedOrigin
      );
    }

    await buildStatement(
      db,
      `
        INSERT INTO ${volunteerTable} (id, name, first_name, last_name, cell_phone, state, city, is_active)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
      `,
      [id, displayName, firstName, lastName, cellPhone, state, city, isActive]
    ).run();

    const saved = await fetchVolunteerById(env, db, volunteerTable, id);
    return ctx.jsonResponse(
      { ok: true, volunteer: saved },
      201,
      ctx.allowedOrigin
    );
  } catch (err) {
    if (err instanceof BadRequestError) {
      return ctx.jsonResponse({ ok: false, error: err.message }, err.status, ctx.allowedOrigin);
    }
    if (err?.status === 403) {
      return ctx.jsonResponse(
        { ok: false, error: 'Admin access required' },
        403,
        ctx.allowedOrigin
      );
    }
    const message = String(err?.message || '');
    if (message.includes('UNIQUE constraint failed')) {
      return ctx.jsonResponse(
        { ok: false, error: 'Volunteer already exists' },
        409,
        ctx.allowedOrigin
      );
    }
    console.error('/admin/volunteers POST error', err);
    return ctx.jsonResponse(
      { ok: false, error: String(err?.message || err) },
      500,
      ctx.allowedOrigin
    );
  }
});

router.get('/admin/volunteers/:id', async (request, env, ctx) => {
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    requireAdmin(auth.email, env);

    const db = getDb(env);
    if (!db) {
      return missingTableResponse('volunteers', ctx.allowedOrigin);
    }

    const url = new URL(request.url);
    const rawId = url.pathname.split('/').pop();
    const id = rawId ? decodeURIComponent(String(rawId)).trim().toLowerCase() : '';
    if (!id) {
      throw new BadRequestError('volunteer id required');
    }

    console.log(`[GET /admin/volunteers/:id] Received id from URL: "${rawId}" -> decoded: "${id}"`);

    const volunteerTable = await resolveTable(env, ['volunteers']);
    const row = await fetchVolunteerById(env, db, volunteerTable, id);
    console.log(`[GET /admin/volunteers/:id] fetchVolunteerById returned:`, row ? `found ${row.id}` : 'NOT FOUND');
    if (!row) {
      return ctx.jsonResponse({ ok: false, error: 'Volunteer not found' }, 404, ctx.allowedOrigin);
    }
    return ctx.jsonResponse({ ok: true, volunteer: row }, 200, ctx.allowedOrigin);
  } catch (err) {
    if (err instanceof BadRequestError) {
      return ctx.jsonResponse({ ok: false, error: err.message }, err.status, ctx.allowedOrigin);
    }
    if (err?.status === 403) {
      return ctx.jsonResponse({ ok: false, error: 'Admin access required' }, 403, ctx.allowedOrigin);
    }
    console.error('/admin/volunteers/:id GET error', err);
    return ctx.jsonResponse({ ok: false, error: String(err?.message || err) }, 500, ctx.allowedOrigin);
  }
});

router.put('/admin/volunteers/:id', async (request, env, ctx) => {
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    requireAdmin(auth.email, env);

    const body = await readJson(request);

    const db = getDb(env);
    if (!db) {
      return missingTableResponse('volunteers', ctx.allowedOrigin);
    }

    const url = new URL(request.url);
    const rawId = url.pathname.split('/').pop();
    const id = rawId ? decodeURIComponent(String(rawId)).trim().toLowerCase() : '';
    if (!id) {
      throw new BadRequestError('volunteer id required');
    }

    console.log(`[PUT /admin/volunteers/:id] Received id from URL: "${rawId}" -> decoded: "${id}"`);

    const volunteerTable = await resolveTable(env, ['volunteers']);

    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (body.name !== undefined) {
      updates.push(`name = ?${paramIndex++}`);
      params.push(String(body.name || '').trim() || null);
    }
    if (body.first_name !== undefined) {
      updates.push(`first_name = ?${paramIndex++}`);
      params.push(body.first_name ? String(body.first_name).trim() : null);
    }
    if (body.last_name !== undefined) {
      updates.push(`last_name = ?${paramIndex++}`);
      params.push(body.last_name ? String(body.last_name).trim() : null);
    }
    if (body.cell_phone !== undefined) {
      updates.push(`cell_phone = ?${paramIndex++}`);
      params.push(normalizeCellPhone(body.cell_phone || ''));
    }
    if (body.state !== undefined) {
      updates.push(`state = ?${paramIndex++}`);
      params.push(body.state ? String(body.state).trim().toUpperCase() : null);
    }
    if (body.city !== undefined) {
      updates.push(`city = ?${paramIndex++}`);
      params.push(body.city ? String(body.city).trim().toUpperCase() : null);
    }
    if (body.is_active !== undefined) {
      updates.push(`is_active = ?${paramIndex++}`);
      params.push(coerceBooleanFlag(body.is_active, 1));
    }

    if (!updates.length) {
      throw new BadRequestError('No updates provided');
    }

    params.push(id);
    await buildStatement(
      db,
      `
        UPDATE ${volunteerTable}
        SET ${updates.join(', ')}
        WHERE lower(trim(id)) = lower(trim(?${paramIndex}))
      `,
      params
    ).run();

    const saved = await fetchVolunteerById(env, db, volunteerTable, id);
    if (!saved) {
      return ctx.jsonResponse(
        { ok: false, error: 'Volunteer not found' },
        404,
        ctx.allowedOrigin
      );
    }
    return ctx.jsonResponse(
      { ok: true, volunteer: saved },
      200,
      ctx.allowedOrigin
    );
  } catch (err) {
    if (err instanceof BadRequestError) {
      return ctx.jsonResponse({ ok: false, error: err.message }, err.status, ctx.allowedOrigin);
    }
    if (err?.status === 403) {
      return ctx.jsonResponse(
        { ok: false, error: 'Admin access required' },
        403,
        ctx.allowedOrigin
      );
    }
    console.error('/admin/volunteers PUT error', err);
    return ctx.jsonResponse(
      { ok: false, error: String(err?.message || err) },
      500,
      ctx.allowedOrigin
    );
  }
});

router.delete('/admin/volunteers/:id', async (request, env, ctx) => {
  try {
    const auth = await ensureAuth(request, env, ctx.config);
    requireAdmin(auth.email, env);

    const db = getDb(env);
    if (!db) {
      return missingTableResponse('volunteers', ctx.allowedOrigin);
    }

    const url = new URL(request.url);
    const rawId = url.pathname.split('/').pop();
    const id = rawId ? decodeURIComponent(String(rawId)).trim().toLowerCase() : '';
    if (!id) {
      throw new BadRequestError('volunteer id required');
    }

    const volunteerTable = await resolveTable(env, ['volunteers']);
    await buildStatement(
      db,
      `DELETE FROM ${volunteerTable} WHERE id = ?1`,
      [id]
    ).run();

    return ctx.jsonResponse(
      { ok: true, deleted: id },
      200,
      ctx.allowedOrigin
    );
  } catch (err) {
    if (err instanceof BadRequestError) {
      return ctx.jsonResponse({ ok: false, error: err.message }, err.status, ctx.allowedOrigin);
    }
    if (err?.status === 403) {
      return ctx.jsonResponse(
        { ok: false, error: 'Admin access required' },
        403,
        ctx.allowedOrigin
      );
    }
    console.error('/admin/volunteers DELETE error', err);
    return ctx.jsonResponse(
      { ok: false, error: String(err?.message || err) },
      500,
      ctx.allowedOrigin
    );
  }
});

function parseJsonSafe(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function serializeMetadataInput(input) {
  if (input === undefined || input === null || input === '') {
    return null;
  }
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;
    JSON.parse(trimmed); // throws if invalid
    return trimmed;
  }
  return JSON.stringify(input);
}

function normalizeSegmentsInput(rawSegments) {
  if (!Array.isArray(rawSegments)) return [];
  return rawSegments
    .map(segment => ({
      segment_key: typeof segment?.segment_key === 'string' ? segment.segment_key.trim() : '',
      segment_value: typeof segment?.segment_value === 'string' ? segment.segment_value.trim() : '',
    }))
    .filter(segment => segment.segment_key && segment.segment_value);
}

async function replaceTouchpointSegments(db, segmentTable, touchpointId, segments) {
  if (!segmentTable) return;
  await buildStatement(
    db,
    `DELETE FROM ${segmentTable} WHERE touchpoint_id = ?1`,
    [touchpointId]
  ).run();
  if (!segments || !segments.length) return;
  for (const segment of segments) {
    await buildStatement(
      db,
      `
        INSERT INTO ${segmentTable} (touchpoint_id, segment_key, segment_value)
        VALUES (?1, ?2, ?3)
      `,
      [touchpointId, segment.segment_key, segment.segment_value]
    ).run();
  }
}

async function fetchTouchpointById(env, db, touchpointTable, segmentTable, touchpointId) {
  const row = await buildStatement(
    db,
    `
      SELECT touchpoint_id, label, icebreaker, body, cta_question,
             issue_tag, channels, priority, is_active, metadata,
             created_at, updated_at
      FROM ${touchpointTable}
      WHERE touchpoint_id = ?1
    `,
    [touchpointId]
  ).first();
  if (!row) return null;
  let segments = [];
  if (segmentTable) {
    const segmentResult = await buildStatement(
      db,
      `
        SELECT segment_key, segment_value
        FROM ${segmentTable}
        WHERE touchpoint_id = ?1
        ORDER BY id ASC
      `,
      [touchpointId]
    ).all();
    segments = segmentResult?.results || [];
  }
  return {
    ...row,
    metadata_raw: row.metadata,
    metadata: parseJsonSafe(row.metadata),
    segments,
  };
}

function generateTouchpointId(label = '') {
  const base = String(label || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  if (base) return base;
  return `tp_${Date.now()}`;
}

function coerceBooleanFlag(value, defaultValue = 1) {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'active'].includes(normalized)) return 1;
  if (['0', 'false', 'no', 'inactive'].includes(normalized)) return 0;
  return defaultValue;
}

function normalizeCellPhone(value) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

function buildVolunteerName(firstName, lastName, fallback = '') {
  const parts = [];
  if (firstName) parts.push(firstName);
  if (lastName) parts.push(lastName);
  const joined = parts.join(' ').trim();
  return joined || fallback;
}

function deriveVolunteerDisplayName(volunteer, fallbackEmail) {
  if (!volunteer) {
    return fallbackEmail ? fallbackEmail.split('@')[0] : 'Volunteer';
  }
  const fromNames = buildVolunteerName(volunteer.first_name, volunteer.last_name, '');
  if (fromNames) return fromNames;
  if (volunteer.name) return volunteer.name;
  if (volunteer.id) return volunteer.id.split('@')[0];
  return fallbackEmail ? fallbackEmail.split('@')[0] : 'Volunteer';
}

function pickVolunteerNotifyRecipient(env) {
  const raw = env?.VOLUNTEER_NOTIFY_EMAIL || env?.ADMIN_EMAILS || '';
  return String(raw)
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)[0] || null;
}

async function maybeSendVolunteerNotification(env, submission = {}) {
  const toEmail = pickVolunteerNotifyRecipient(env);
  if (!toEmail) {
    return { sent: false, skipped: 'no_recipient_configured' };
  }
  const host = (env?.PUBLIC_HOSTNAME || 'volunteers.grassrootsmvt.org').replace(/^https?:\/\//, '');
  const fromEmail = env?.NOTIFY_FROM_EMAIL || `notifications@${host}`;
  const action = submission.action || 'submission';
  const stagingId = submission.stagingId || 'pending';
  const lines = [
    'A volunteer submitted a staging record.',
    `Action: ${action}`,
    submission.targetId ? `Target: ${submission.targetId}` : null,
    submission.email ? `Volunteer email: ${submission.email}` : null,
    submission.firstName || submission.lastName ? `Name: ${buildVolunteerName(submission.firstName, submission.lastName)}` : null,
    submission.county ? `County: ${submission.county}` : null,
    submission.city ? `City: ${submission.city}` : null,
    submission.state ? `State: ${submission.state}` : null,
    `Staging ID: ${stagingId}`,
    `Submitted at: ${new Date().toISOString()}`,
  ]
    .filter(Boolean)
    .join('\n');

  const payload = {
    personalizations: [{ to: [{ email: toEmail }] }],
    from: { email: fromEmail, name: 'GrassrootsMVT' },
    subject: `New volunteer ${action} (${stagingId})`,
    content: [{ type: 'text/plain', value: lines }],
  };

  try {
    const resp = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      return { sent: false, status: resp.status, detail };
    }
    return { sent: true, status: resp.status };
  } catch (err) {
    console.warn('mail notification failed', err);
    return { sent: false, error: String(err?.message || err) };
  }
}

async function fetchVolunteerById(env, db, volunteerTable, id) {
  const normalizedId = id ? String(id).trim().toLowerCase() : '';
  console.log(`[fetchVolunteerById] Looking up id="${id}" -> normalized="${normalizedId}" in table=${volunteerTable}`);
  const row = await buildStatement(
    db,
    `
      SELECT id, name, first_name, last_name, cell_phone, state, city, is_active
      FROM ${volunteerTable}
      WHERE lower(trim(id)) = lower(trim(?1))
    `,
    [normalizedId]
  ).first();
  console.log(`[fetchVolunteerById] Result:`, row ? `found: ${row.id}` : 'NOT FOUND');
  return row || null;
}

async function getVoterProfile(env, db, voterId) {
  if (!voterId) return null;
  const votersTable = await resolveTableOptional(env, ['voters']);
  if (!votersTable) return null;
  const row = await buildStatement(
    db,
    `SELECT * FROM ${votersTable} WHERE voter_id = ?1`,
    [voterId]
  ).first();
  return row || null;
}

function normalizeProfile(profile) {
  if (!profile || typeof profile !== 'object') return {};
  const normalized = {};
  for (const [key, value] of Object.entries(profile)) {
    if (value === undefined || value === null) continue;
    normalized[String(key).toLowerCase()] = String(value).toLowerCase();
  }
  if (normalized.political_party && !normalized.party) {
    normalized.party = normalized.political_party;
  }
  if (normalized.house && !normalized.house_district) {
    normalized.house_district = normalized.house;
  }
  if (normalized.senate && !normalized.senate_district) {
    normalized.senate_district = normalized.senate;
  }
  return normalized;
}

function touchpointSupportsChannel(touchpoint, channel) {
  const rawChannels = String(touchpoint?.channels || '').trim();
  if (!rawChannels) return true;
  const tokens = rawChannels
    .split(',')
    .map(token => token.trim().toLowerCase())
    .filter(Boolean);
  if (!tokens.length) return true;
  return tokens.includes(channel);
}

function segmentsMatchProfile(segments, normalizedProfile) {
  if (!segments || !segments.length) return true;
  return segments.every(segment => {
    const key = String(segment.segment_key || '').toLowerCase();
    if (!key) return true;
    const expected = String(segment.segment_value || '').toLowerCase();
    const actual = normalizedProfile[key];
    if (actual === undefined || actual === null) {
      return false;
    }
    return String(actual).toLowerCase() === expected;
  });
}

async function pickTouchpoint(env, db, channel, voterProfile) {
  const touchpointTable = await resolveTableOptional(env, ['campaign_touchpoints']);
  if (!touchpointTable) return null;

  const candidatesResult = await buildStatement(
    db,
    `
      SELECT
        touchpoint_id,
        label,
        icebreaker,
        body,
        cta_question,
        issue_tag,
        channels,
        priority,
        metadata
      FROM ${touchpointTable}
      WHERE is_active = 1
      ORDER BY priority ASC, created_at DESC
      LIMIT 25
    `
  ).all();

  const candidates = candidatesResult?.results || [];
  if (!candidates.length) return null;

  const normalizedChannel = String(channel || 'phone').toLowerCase();
  const normalizedProfile = normalizeProfile(voterProfile);

  const segmentTable = await resolveTableOptional(env, ['campaign_touchpoint_segments']);
  const segmentsByTouchpoint = {};
  if (segmentTable && candidates.length) {
    const params = candidates.map(candidate => candidate.touchpoint_id);
    const placeholders = params.map((_, index) => `?${index + 1}`).join(', ');
    const segmentResult = await buildStatement(
      db,
      `
        SELECT touchpoint_id, segment_key, segment_value
        FROM ${segmentTable}
        WHERE touchpoint_id IN (${placeholders})
      `,
      params
    ).all();
    const segmentRows = segmentResult?.results || [];
    for (const row of segmentRows) {
      const list = segmentsByTouchpoint[row.touchpoint_id] || [];
      list.push(row);
      segmentsByTouchpoint[row.touchpoint_id] = list;
    }
  }

  for (const candidate of candidates) {
    if (!touchpointSupportsChannel(candidate, normalizedChannel)) continue;
    const segments = segmentsByTouchpoint[candidate.touchpoint_id] || [];
    if (!segments.length || segmentsMatchProfile(segments, normalizedProfile)) {
      return candidate;
    }
  }

  return candidates.find(candidate => touchpointSupportsChannel(candidate, normalizedChannel)) || null;
}
