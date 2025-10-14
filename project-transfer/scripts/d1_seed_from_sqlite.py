#!/usr/bin/env python3
"""
Seed D1 'wy' from local sqlite in batches using wrangler d1 execute --file.
Usage:
  python3 scripts/d1_seed_from_sqlite.py /path/to/wy.sqlite

This script is destructive only to the extent it INSERTs/REPLACEs rows into D1.
It uses INSERT OR REPLACE so re-running is idempotent for primary key rows.
"""
import sqlite3, sys, csv, subprocess, tempfile, os
from pathlib import Path

def esc(s):
    if s is None:
        return 'NULL'
    s = str(s)
    s = s.replace("'", "''")
    return "'" + s + "'"

def run_sqlfile_on_d1(path):
    cmd = ['wrangler','d1','execute','wy','--remote','--file', str(path)]
    print('Running:', ' '.join(cmd))
    res = subprocess.run(cmd, capture_output=True, text=True)
    print('Exit', res.returncode)
    if res.stdout:
        print(res.stdout)
    if res.stderr:
        print(res.stderr)
    if res.returncode != 0:
        raise SystemExit('wrangler command failed')


def batch_insert(conn, cursor, table, cols, select_sql, batch_size=2000):
    cur = conn.cursor()
    cur.execute(select_sql)
    rows = cur.fetchall()
    total = len(rows)
    print(f'Found {total} rows for {table}')
    i = 0
    while i < total:
        batch = rows[i:i+batch_size]
        values = []
        for r in batch:
            vals = ','.join(esc(v) for v in r)
            values.append('(' + vals + ')')
        cols_list = ','.join(cols)
        sql = f"INSERT OR REPLACE INTO {table} ({cols_list}) VALUES\n" + ',\n'.join(values) + ';'
        # write to tmp file
        fh, fname = tempfile.mkstemp(suffix='.sql', prefix=f'd1_{table}_')
        os.close(fh)
        with open(fname, 'w') as f:
            f.write(sql)
        run_sqlfile_on_d1(fname)
        os.remove(fname)
        i += batch_size
        print(f'Inserted batch up to {i} / {total}')
    print(f'Done seeding {table}')


def verify_counts(table):
    cmd = ['wrangler','d1','execute','wy','--remote','--command', f"SELECT COUNT(*) AS cnt FROM {table};"]
    res = subprocess.run(cmd, capture_output=True, text=True)
    print(res.stdout)
    if res.returncode != 0:
        print('verify command failed', res.stderr)


if __name__ == '__main__':
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / 'projects' / 'voterdata' / 'wyoming' / 'wy.sqlite'
    if not path.exists():
        print('SQLite file missing:', path)
        sys.exit(1)
    conn = sqlite3.connect(str(path))
    # 1) voters
    # Map local column names to the target columns expected by D1
    # local columns: senate_district, house_district -> map to senate, house
    voters_select = "SELECT voter_id, political_party, county, senate_district AS senate, house_district AS house FROM voters;"
    batch_insert(conn, conn.cursor(), 'voters', ['voter_id','political_party','county','senate','house'], voters_select)
    verify_counts('voters')

    # 2) best_phone (from voter_phones)
    # prefer voter_phones table if present
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('best_phone','voter_phones') LIMIT 1;")
    tbl = cur.fetchone()
    if tbl:
        source = tbl[0]
    else:
        source = 'voter_phones'
    # Insert into the materialized table `v_best_phone` (avoid inserting into
    # the `best_phone` view which may be circularly defined in some D1
    # deployments). The worker code references `v_best_phone` directly
    # so populating this table is sufficient.
    batch_insert(conn, conn.cursor(), 'v_best_phone', ['voter_id','phone_e164','confidence_code','is_wy_area','imported_at'],
                 f"SELECT voter_id, phone_e164, confidence_code, is_wy_area, imported_at FROM {source};")
    verify_counts('v_best_phone')

    # 3) voters_addr_norm: try view v_voters_addr_norm then voters_addr_norm
    cur.execute("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name IN ('v_voters_addr_norm','voters_addr_norm') LIMIT 1;")
    tbl = cur.fetchone()
    if tbl:
        source = tbl[0]
        # Use the same batched insertion strategy used above to avoid
        # creating one enormous SQL statement that exceeds D1 limits.
    # Use a smaller batch size for address rows (they tend to contain
    # longer strings which can make a single SQL file exceed D1 limits).
    batch_insert(conn, conn.cursor(), 'voters_addr_norm',
             ['voter_id','ln','fn','addr1','city','state','zip','senate','house'],
             f"SELECT voter_id, ln, fn, addr1, city, state, zip, senate, house FROM {source};",
             batch_size=500)
        verify_counts('voters_addr_norm')
    else:
        print('No source for voters_addr_norm found in sqlite; skipping')

    conn.close()
    # smoke tests
    print('\nRunning smoke tests against local worker endpoints...')
    import shlex
    # canvass nearby (use arg list to avoid shell quoting issues)
    canvass_cmd = [
        'curl','-sS','-X','POST','http://127.0.0.1:8787/api/canvass/nearby',
        '-H','Content-Type: application/json',
        '-d','{"filters":{},"street":"MAIN","house":100,"range":10,"limit":1}'
    ]
    print('CANVASS:', ' '.join(canvass_cmd))
    subprocess.run(canvass_cmd)
    # call next
    callnext_cmd = ['curl','-sS','-X','POST','http://127.0.0.1:8787/api/next']
    print('\nCALL NEXT:', ' '.join(callnext_cmd))
    subprocess.run(callnext_cmd)
    print('\nAll done')
