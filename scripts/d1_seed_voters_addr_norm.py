#!/usr/bin/env python3
"""
Seed only `voters_addr_norm` from local sqlite to D1 in small batches.
Usage:
  python3 scripts/d1_seed_voters_addr_norm.py /path/to/wy.sqlite

This script is idempotent for primary-key rows (INSERT OR REPLACE),
and only touches `voters_addr_norm` on D1.
"""
import sqlite3, sys, subprocess, tempfile, os
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


def batch_insert(conn, cursor, table, cols, select_sql, batch_size=500):
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
        fh, fname = tempfile.mkstemp(suffix='.sql', prefix=f'd1_{table}_')
        os.close(fh)
        with open(fname, 'w') as f:
            f.write(sql)
        run_sqlfile_on_d1(fname)
        os.remove(fname)
        i += batch_size
        print(f'Inserted batch up to {min(i,total)} / {total}')
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
    cur = conn.cursor()

    # Find source for voters_addr_norm in local sqlite
    cur.execute("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name IN ('v_voters_addr_norm','voters_addr_norm') LIMIT 1;")
    tbl = cur.fetchone()
    if not tbl:
        print('No source for voters_addr_norm found in sqlite; aborting')
        sys.exit(1)
    source = tbl[0]
    print('Using source', source)

    # Insert into the materialized backing object `v_voters_addr_norm` so
    # the existing `voters_addr_norm` view (which selects FROM
    # `v_voters_addr_norm`) will reflect the rows. Some D1 deployments
    # define `voters_addr_norm` as a view, so inserting into the view fails.
    batch_insert(conn, conn.cursor(), 'v_voters_addr_norm', ['voter_id','ln','fn','addr1','city','state','zip','senate','house'],
                 f"SELECT voter_id, ln, fn, addr1, city, state, zip, senate, house FROM {source};",
                 batch_size=500)
    # Verify the public view now returns rows
    verify_counts('voters_addr_norm')

    conn.close()
    print('Done')
