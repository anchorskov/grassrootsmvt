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

const cors = {
  "access-control-allow-origin": "https://volunteers.grassrootsmvt.org",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type, cf-access-jwt-assertion"
};

const requireUser = (req: Request, env: Env) => {
  const email = req.headers.get(env.ACCESS_HEADER);
  if (!email) throw new Response("Unauthorized (Cloudflare Access required)", { status: 401, headers: cors });
  return email.toLowerCase();
};

async function whoami(req: Request, env: Env) {
  const email = req.headers.get(env.ACCESS_HEADER) || "unknown";
  return json({ email }, { headers: cors });
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
    if (url.pathname === "/call/next" && req.method === "POST") return callNext(req, env);
    if (url.pathname === "/call/complete" && req.method === "POST") return callComplete(req, env);

    return new Response("ok", { headers: cors });
  }
} as any;
