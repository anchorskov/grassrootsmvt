const ADMINS = new Set<string>([
  "anchorskov@gmal.com",
  "skovgard2026@gmail.com"
]);

export function requireAdminEmail(req: Request) {
  const email = req.headers.get("Cf-Access-Authenticated-User-Email") || "";
  if (!ADMINS.has(email)) {
    return { ok: false, res: new Response("Forbidden", { status: 403 }) };
  }
  return { ok: true, email };
}
