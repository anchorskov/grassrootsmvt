#!/usr/bin/env python3
"""
Finish seeding only `voters_addr_norm` from local sqlite to D1 in safe batches.

Usage:
  python3 scripts/d1_finish_voters_addr_norm.py /path/to/wy.sqlite [--batch 500] [--target v_voters_addr_norm]

Notes:
 - This script ONLY inserts into the specified target table on D1 (default: v_voters_addr_norm).
 - It will not touch `voters`, `v_best_phone`, or any other tables.
 - It is idempotent (uses INSERT OR REPLACE) and uses small batches to avoid D1 limits.
"""
import sqlite3, sys, subprocess, tempfile, os, argparse
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
    print(f'Found {total} rows to insert into {table}')
    if total == 0:
        print('Nothing to do.')
        return
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


def verify_counts_remote(table):
    # Try to fetch a remote count; parsing is best-effort.
    cmd = ['wrangler','d1','execute','wy','--remote','--command', f"SELECT COUNT(*) AS cnt FROM {table};"]
    res = subprocess.run(cmd, capture_output=True, text=True)
    out = res.stdout + '\n' + res.stderr
    # Look for an integer in the output
    import re
    m = re.search(r"\b(\d{1,9})\b", out)
    if m:
        return int(m.group(1))
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('sqlite', nargs='?', default=str(Path.home() / 'projects' / 'voterdata' / 'wyoming' / 'wy.sqlite'))
    parser.add_argument('--batch', type=int, default=500, help='rows per batch')
    parser.add_argument('--target', default='v_voters_addr_norm', help='target table on D1 to insert into (default v_voters_addr_norm)')
    parser.add_argument('--source', default=None, help='optional source table/view name in local sqlite (default: prefer v_voters_addr_norm then voters_addr_norm)')
    args = parser.parse_args()

    sqpath = Path(args.sqlite)
    if not sqpath.exists():
        print('SQLite file missing:', sqpath)
        sys.exit(1)

    conn = sqlite3.connect(str(sqpath))
    cur = conn.cursor()

    # Determine local source
    if args.source:
        source = args.source
    else:
        cur.execute("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name IN ('v_voters_addr_norm','voters_addr_norm') LIMIT 1;")
        r = cur.fetchone()
        if not r:
            print('No source for voters_addr_norm found in local sqlite; aborting')
            sys.exit(1)
        source = r[0]
    print('Local source table/view:', source)

    # Optional remote pre-check: if remote already has the same count as local, skip
    cur.execute(f"SELECT COUNT(*) FROM {source};")
    local_cnt = cur.fetchone()[0]
    print('Local source count:', local_cnt)

    remote_cnt = verify_counts_remote(args.target)
    if remote_cnt is not None:
        print(f'Remote {args.target} count:', remote_cnt)
        if remote_cnt >= local_cnt:
            print('Remote already has >= local rows; nothing to do.')
            return
        else:
            print('Need to insert', local_cnt - remote_cnt, 'rows (approx)')
    else:
        print('Could not determine remote count programmatically; proceeding with batched upload')

    # Perform batched INSERT OR REPLACE into D1 target
    select_sql = f"SELECT voter_id, ln, fn, addr1, city, state, zip, senate, house FROM {source};"
    batch_insert(conn, conn.cursor(), args.target, ['voter_id','ln','fn','addr1','city','state','zip','senate','house'], select_sql, batch_size=args.batch)

    # Final remote verification
    final = verify_counts_remote(args.target)
    print('Final remote count (best-effort):', final)
    conn.close()

if __name__ == '__main__':
    main()
