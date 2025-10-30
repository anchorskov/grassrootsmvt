// src/utils/dbVerify.js
// Utility to verify D1 schema consistency at Worker startup

/**
 * Verifies that all required tables exist in the D1 database.
 * Logs a warning for any missing tables.
 * @param {object} env - Worker environment containing D1 binding
 * @param {string[]} requiredTables - List of required table names
 */
export async function verifyD1Schema(env, requiredTables) {
  if (!env?.d1) {
    console.warn('[dbVerify] D1 binding missing in env');
    return;
  }
  try {
    const result = await env.d1.prepare(
      `SELECT name FROM sqlite_master WHERE type='table'`
    ).all();
    const existingTables = (result.results || []).map(row => row.name);
    const missing = requiredTables.filter(tbl => !existingTables.includes(tbl));
    if (missing.length > 0) {
      console.warn('[dbVerify] Missing tables:', missing);
    } else {
      console.log('[dbVerify] All required tables present');
    }
  } catch (err) {
    console.error('[dbVerify] Error verifying schema:', err);
  }
}
