// Minimal ambient declarations to satisfy the compiler for Cloudflare D1 and worker handler types.
// These are intentionally minimal to avoid adding external dependencies. If you prefer
// full official types, install `@cloudflare/workers-types` and remove this file.

interface D1Result {
  results?: Array<Record<string, unknown>>;
  success?: boolean;
}

interface D1PreparedStatement {
  bind(...args: unknown[]): D1PreparedStatement;
  all(...args: unknown[]): Promise<D1Result>;
}

interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(stmts: Array<D1PreparedStatement>): Promise<Array<D1Result | unknown>>;
}

type ExportedHandler<TEnv = Record<string, unknown>> = {
  fetch?: (req: Request, env: TEnv) => Promise<Response> | Response;
};
