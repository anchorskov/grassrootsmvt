You are my project assistant.

Read the file tree.txt from the project root.

Your task is to generate a single zip command that includes **only the specific source files** we’re actively maintaining.  
The goal is to create a lightweight, review-focused snapshot — sometimes limited to a few files, sometimes complete.

Follow these rules:

1. Include only real source files listed in tree.txt.
2. Exclude all vendor, build, and dependency directories:
   node_modules, .git, dist, .wrangler, .cache, build, .parcel-cache, logs, temp_api_backup, project-transfer.
3. Do **not** use wildcards (`*`) or recursive folders.
4. Each file path should appear only once, written cleanly on its own line.
5. Output only the **zip command**, no commentary or extra text.
6. Use this naming format for the zip:
   `snapshot_YYYYMMDD_HHMM.zip`
7. Keep the list concise and readable, backslash-escaped for line breaks.
8. The purpose of the zip is **fast project review** — sometimes focused (e.g., UI bugfix), sometimes full snapshot.

Format your output like this:

zip snapshot_20251019_1530.zip \
  worker/src/index.js \
  worker/src/routes/whoami.js \
  ui/canvass/index.html \
  ui/contact-form/index.html \
  ui/config/environments.js \
  README.md \
  worker/wrangler.toml

If I specify a focus (for example, "restore email workflow" or "street autocomplete review"), include only the files in tree.txt relevant to that focus area.  
Otherwise, include all actively maintained non-vendor source files.

