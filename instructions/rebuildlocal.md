# Rebuild Local D1 (wy_local)

## Step 1: Clear existing local D1 state
From the worker directory, pin wrangler state locally and remove any lingering miniflare DB files:

```bash
cd /home/anchor/projects/grassrootsmvt/worker
export XDG_CONFIG_HOME=$PWD
rm -f .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite
```

## Step 2: Recreate schema and import remote data
Rebuild the schema from migrations, then import the current remote snapshot:

```bash
# Apply migrations locally (recreates schema)
wrangler d1 migrations apply wy_local --local

# Export remote prod data
wrangler d1 export wy --remote > /tmp/wy_remote_dump.sql

# Import into local
wrangler d1 execute wy_local --local --file /tmp/wy_remote_dump.sql

# Verify tables and counts
wrangler d1 execute wy_local --local --command "PRAGMA table_info(volunteers); SELECT COUNT(*) FROM volunteers;"
```

After these steps, start dev with the pinned state:
```bash
XDG_CONFIG_HOME=$PWD wrangler dev --local
```
