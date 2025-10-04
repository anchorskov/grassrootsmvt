#!/usr/bin/env python3
import csv, sqlite3
from pathlib import Path

repo = Path(__file__).resolve().parents[1]
csv_dir = repo / 'api' / 'tmp'
import sys
sqlite_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / 'projects' / 'voterdata' / 'wy.sqlite'

mapping = [
    ('voters.csv', 'voters', 'tmp_voters_csv'),
    ('voters_addr_norm.csv', 'voters_addr_norm', 'tmp_voters_addr_norm_csv'),
    ('best_phone.csv', 'best_phone', 'tmp_best_phone_csv'),
]

conn = sqlite3.connect(str(sqlite_path))
cur = conn.cursor()
print('Using sqlite:', sqlite_path)

for csv_name, target_tbl, tmp_tbl in mapping:
    path = csv_dir / csv_name
    if not path.exists():
        print(f'Missing CSV: {path}')
        continue
    print('\nProcessing', csv_name)
    # create tmp table
    cur.execute(f"DROP TABLE IF EXISTS {tmp_tbl}")
    cur.execute(f"CREATE TABLE {tmp_tbl} (voter_id TEXT PRIMARY KEY)")
    conn.commit()
    # insert voter_ids
    inserted = 0
    with open(path, newline='') as fh:
        reader = csv.reader(fh)
        for i,row in enumerate(reader):
            if not row: continue
            vid = row[0].strip()
            if not vid: continue
            try:
                cur.execute(f"INSERT OR IGNORE INTO {tmp_tbl}(voter_id) VALUES (?)", (vid,))
                inserted += cur.rowcount
            except Exception as e:
                print('Insert error', e)
    conn.commit()
    cur.execute(f"SELECT COUNT(*) FROM {tmp_tbl}")
    cnt = cur.fetchone()[0]
    print(f'Inserted unique ids into {tmp_tbl}:', cnt)
    # check if target table exists
    cur.execute("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name=?", (target_tbl,))
    exists = cur.fetchone() is not None
    print('Target table exists:', exists)
    if exists:
        cur.execute(f"SELECT COUNT(*) FROM {target_tbl}")
        tcnt = cur.fetchone()[0]
        print('Rows in target table', target_tbl, '=', tcnt)
        # find up to 20 ids in tmp not in target
        cur.execute(f"SELECT voter_id FROM {tmp_tbl} WHERE voter_id NOT IN (SELECT voter_id FROM {target_tbl}) LIMIT 20")
        missing = [r[0] for r in cur.fetchall()]
        print('Sample ids in CSV but not in target (up to 20):', missing)
    else:
        print(f'Cannot diff: target table {target_tbl} missing in sqlite')

conn.close()
print('\nDone')
