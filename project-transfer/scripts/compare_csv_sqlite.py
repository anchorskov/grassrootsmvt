#!/usr/bin/env python3
import csv, sqlite3, sys
from pathlib import Path

repo = Path(__file__).resolve().parents[1]
csv_dir = repo / 'api' / 'tmp'
sqlite_path = Path.home() / 'projects' / 'voterdata' / 'wy.sqlite'

files = [
    ('voters.csv', 'voters', 0),
    ('voters_addr_norm.csv', 'voters_addr_norm', 0),
    ('best_phone.csv', 'best_phone', 1),
]

conn = sqlite3.connect(str(sqlite_path))
cur = conn.cursor()

print('Using sqlite:', sqlite_path)

for fname, tbl, idcol in files:
    path = csv_dir / fname
    if not path.exists():
        print(f'CSV missing: {path}')
        continue
    with open(path, newline='') as fh:
        reader = csv.reader(fh)
        rows = list(reader)
    print('\nFile:', path.name, 'rows=', len(rows))
    # detect header by sampling first row: if non-numeric first col for voters, consider header
    header = False
    if len(rows) and not rows[0][0].isdigit():
        header = True
    print('Header detected:', header)
    # extract voter_ids (first column) - but some files may have header or extra columns
    csv_ids = [r[0].strip() for (i,r) in enumerate(rows) if r and (not header or i>0)]
    csv_ids_set = set(csv_ids)
    print('Unique ids in CSV:', len(csv_ids_set))
    # get sqlite ids
    try:
        cur.execute(f"SELECT voter_id FROM {tbl} LIMIT 1")
        has = cur.fetchone() is not None
    except Exception as e:
        print('Table missing or error querying', tbl, e)
        continue
    cur.execute(f"SELECT COUNT(*) FROM {tbl}")
    cnt = cur.fetchone()[0]
    print('Rows in sqlite table', tbl, '=', cnt)
    # find up to 20 csv ids missing in sqlite
    samples_missing = []
    BATCH = 500
    csv_list = list(csv_ids_set)
    for i in range(0, len(csv_list), BATCH):
        batch = csv_list[i:i+BATCH]
        q = 'SELECT voter_id FROM {t} WHERE voter_id IN ({ph})'.format(t=tbl, ph=','.join(['?']*len(batch)))
        cur.execute(q, batch)
        present = set(r[0] for r in cur.fetchall())
        for v in batch:
            if v not in present:
                samples_missing.append(v)
                if len(samples_missing) >= 20:
                    break
        if len(samples_missing) >= 20:
            break
    print('Sample missing ids (up to 20):', samples_missing[:20])

conn.close()
print('\nDone')
