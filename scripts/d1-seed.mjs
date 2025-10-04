// scripts/d1-seed.mjs
// Usage:
//   node scripts/d1-seed.mjs <binding> <table> <csvPath> <col1> <col2> ...
// Example:
//   node scripts/d1-seed.mjs wy voters tmp/voters.csv voter_id political_party county senate house

import fs from "node:fs";
import { spawnSync } from "node:child_process";

const [,, BINDING, TABLE, CSV_PATH, ...COLS] = process.argv;

if (!BINDING || !TABLE || !CSV_PATH || COLS.length === 0) {
  console.error("Usage: node scripts/d1-seed.mjs <binding> <table> <csvPath> <col1> <col2> ...");
  process.exit(1);
}

if (!fs.existsSync(CSV_PATH)) {
  console.error(`CSV not found: ${CSV_PATH}`);
  process.exit(1);
}

const BATCH_SIZE = Number(process.env.BATCH_SIZE || 1000);

// Very simple CSV parser (assumes no embedded newlines; doubles quotes inside fields)
function parseCsvLine(line) {
  // handle simple quoted CSV; good enough for our exports from sqlite3 -csv
  const out = [];
  let cur = "";
  let inQ = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++; } // escaped quote
      else { inQ = !inQ; }
    } else if (ch === ',' && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function sqlEscape(v) {
  if (v === null || v === undefined) return "NULL";
  // treat empty string as NULL? keep as '' to preserve exact dump
  return `'${String(v).replaceAll("'", "''")}'`;
}

const content = fs.readFileSync(CSV_PATH, "utf8");
const lines = content.split(/\r?\n/).filter(l => l.length > 0);

// If the first row looks like a header that matches COLS, drop it.
const first = parseCsvLine(lines[0]);
const hasHeader = COLS.length === first.length && first.every((h, i) => h.trim().toLowerCase() === COLS[i].trim().toLowerCase());
const dataLines = hasHeader ? lines.slice(1) : lines;

console.log(`Seeding ${TABLE}: ${dataLines.length} rows, columns: ${COLS.join(", ")}`);

let total = 0;
for (let i = 0; i < dataLines.length; i += BATCH_SIZE) {
  const batch = dataLines.slice(i, i + BATCH_SIZE);
  const valuesSql = batch.map(line => {
    const cells = parseCsvLine(line);
    // pad/truncate to COLS length
    const mapped = COLS.map((_, idx) => sqlEscape(cells[idx]));
    return `(${mapped.join(",")})`;
  }).join(",");

  const sql = `INSERT INTO ${TABLE} (${COLS.join(",")}) VALUES ${valuesSql};`;

  const res = spawnSync("wrangler",
    ["d1", "execute", BINDING, "--remote", "--command", sql],
    { stdio: "inherit" }
  );
  if (res.status !== 0) {
    console.error(`Batch ${i/BATCH_SIZE+1} failed`);
    process.exit(res.status || 1);
  }
  total += batch.length;
  console.log(`✅ inserted ${total}/${dataLines.length}`);
}

console.log(`Done: ${TABLE} seeded (${total} rows).`);
