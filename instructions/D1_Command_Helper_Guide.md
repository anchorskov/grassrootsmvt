# D1 Command Helper: bin/wrangler-root

## Overview
`bin/wrangler-root` is a lightweight shell wrapper that ensures all `wrangler d1` commands execute from the correct `worker/` folder where `wrangler.toml` is located. This prevents path-related database access errors and clearly identifies which environment (local vs remote) you're querying.

## Problem It Solves
When wrangler commands are run from different directories, they may attempt to load configuration or databases from unexpected locations:
- Running from project root → looks for D1 in wrong location
- Running from worker/ → uses correct wrangler.toml and D1 bindings

This script normalizes command routing and provides clear environment feedback.

## Installation
The script is already executable at `/home/anchor/projects/grassrootsmvt/bin/wrangler-root`.

## Usage

### Query Local D1 (Development Database)
```bash
./bin/wrangler-root d1 execute wy --local --command "SELECT COUNT(*) FROM legislature"
./bin/wrangler-root d1 execute wy --local --command "SELECT name, chamber FROM legislature LIMIT 5"
./bin/wrangler-root d1 execute wy --local --command "SELECT * FROM volunteers"
```

### Query Remote D1 (Cloudflare Production Database)
```bash
./bin/wrangler-root d1 execute wy --remote --command "SELECT COUNT(*) FROM legislature"
./bin/wrangler-root d1 execute wy --remote --command "SELECT name, chamber FROM legislature LIMIT 5"
./bin/wrangler-root d1 execute wy --remote --command "SELECT * FROM volunteers"
```

### Create a Shortcut (Optional)
Add to your `~/.bashrc` or `~/.zshrc`:
```bash
alias d1-local='cd /home/anchor/projects/grassrootsmvt && ./bin/wrangler-root d1 execute wy --local --command'
alias d1-remote='cd /home/anchor/projects/grassrootsmvt && ./bin/wrangler-root d1 execute wy --remote --command'
```

Then use:
```bash
d1-local "SELECT COUNT(*) FROM legislature"
d1-remote "SELECT name FROM legislature LIMIT 3"
```

## Features

✅ **Automatic Path Resolution**
- Detects project root from script location
- Validates worker/ folder and wrangler.toml
- Fails fast if structure is invalid

✅ **Clear Environment Display**
- Prints which environment (LOCAL vs REMOTE) you're querying
- Shows working directory for debugging

✅ **Works from Any Location**
- Can be called from `/`, `/home`, project root, or subdirectories
- Always routes to correct worker/ folder

✅ **Pass-Through Arguments**
- All args after script name are passed directly to wrangler
- Supports any wrangler d1 subcommand (execute, backup, etc.)

## Example Output

```bash
$ ./bin/wrangler-root d1 execute wy --remote --command "SELECT COUNT(*) FROM legislature"
🌐 Running wrangler from: /home/anchor/projects/grassrootsmvt/worker
📍 Environment: REMOTE (Cloudflare D1)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[
  {
    "results": [
      {
        "legislature_count": 93
      }
    ],
    "success": true,
    ...
  }
]
```

## Error Handling

**Missing worker/ folder:**
```
❌ ERROR: worker folder not found at /path/to/worker
   This script must be run from the grassrootsmvt project root.
```

**Missing wrangler.toml:**
```
❌ ERROR: wrangler.toml not found at /path/to/worker/wrangler.toml
   Cannot proceed without wrangler configuration.
```

## How It Works

1. **Locates itself**: Uses bash `${BASH_SOURCE[0]}` to find script path
2. **Resolves project root**: Goes one level up from `bin/` directory
3. **Validates structure**: Checks for `worker/` and `worker/wrangler.toml`
4. **Detects environment**: Parses arguments for `--remote` flag
5. **Prints diagnostics**: Shows environment before executing command
6. **Executes wrangler**: `cd`s to worker/ and runs command
7. **Exits with command status**: Propagates exit code from wrangler

## Integration with Development Workflow

### Before (Error-Prone)
```bash
# From root - finds wrong DB
$ cd /home/anchor/projects/grassrootsmvt
$ sqlite3 db/wy_local.db "SELECT * FROM legislature"
# ❌ Gets old/incomplete data

# Manual workaround
$ cd worker
$ wrangler d1 execute wy --remote --command "SELECT * FROM legislature"
# ✅ Works but easy to forget folder switch
```

### After (Safe & Clear)
```bash
# From anywhere - always correct
$ cd /home/anchor/projects/grassrootsmvt
$ ./bin/wrangler-root d1 execute wy --remote --command "SELECT * FROM legislature"
# ✅ Shows environment, executes correctly
```

## Script Source
Location: `/home/anchor/projects/grassrootsmvt/bin/wrangler-root`  
Language: Bash  
Size: ~1.7 KB  
Executable: Yes (`chmod +x` already applied)

## See Also
- [README.md](../README.md) - "Direct D1 Commands" section
- `worker/wrangler.toml` - D1 binding configuration
- `instructions/Local_D1_Schema_Snapshot_wy_local_20251201.md` - Database schema reference
