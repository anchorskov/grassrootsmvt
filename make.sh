#!/usr/bin/env bash 
# make.sh — GrassrootsMVT deploy helpers (Bash only, no Make)
set -euo pipefail

# ---------- Config (override via .env or environment) ----------
UI_DIR="${UI_DIR:-ui}"
WORKER_DIR="${WORKER_DIR:-worker}"
PAGES_PROJECT="${PAGES_PROJECT:-${PROJECT:-grassrootsmvt-production}}"

# Cloudflare creds already in your env
CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-}"
CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-}"

# Zone: prefer CF_ZONE_ID, else resolve from ZONE_NAME
CF_ZONE_ID="${CF_ZONE_ID:-c35d0f97d3929c102548522e4ce72b5f}"
ZONE_NAME="${ZONE_NAME:-grassrootsmvt.org}"

VOL_DOMAIN="${VOL_DOMAIN:-https://volunteers.grassrootsmvt.org}"
API_DOMAIN="${API_DOMAIN:-https://api.grassrootsmvt.org}"

# URLs we commonly purge (space-separated override supported)
if [[ -n "${PURGE_URLS:-}" ]]; then
  read -r -a PURGE_URLS <<<"$PURGE_URLS"
else
  PURGE_URLS=(
    "$VOL_DOMAIN/config/environments.js"
    "$VOL_DOMAIN/src/apiClient.js"
  )
fi

# ---------- Bootstrap: load .env if present ----------
if [[ -f .env ]]; then
  set -a; source .env; set +a
  # Re-apply key vars (env takes precedence)
  PAGES_PROJECT="${PAGES_PROJECT:-${PROJECT:-grassrootsmvt-production}}"
fi

# ---------- Helpers ----------
need() { command -v "$1" >/dev/null || { echo "❌ Missing tool: $1"; exit 1; }; }
in_repo_root() {
  [[ -f package.json && -d "$WORKER_DIR" && -d "$UI_DIR" ]] || {
    echo "❌ Run from project root. Current: $(pwd)"; exit 1;
  }
}
resolve_zone() {
  [[ -n "$CF_ZONE_ID" ]] && return 0
  [[ -n "$CLOUDFLARE_API_TOKEN" && -n "$CLOUDFLARE_ACCOUNT_ID" ]] || {
    echo "❌ CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID not set (needed to resolve Zone ID)"; exit 1;
  }
  echo "🔎 Resolving Zone ID for $ZONE_NAME…"
  local resp
  resp="$(curl -sS -G "https://api.cloudflare.com/client/v4/zones" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" \
    --data-urlencode "name=$ZONE_NAME" \
    --data-urlencode "account.id=$CLOUDFLARE_ACCOUNT_ID")"
  grep -q '"success":true' <<<"$resp" || { echo "❌ Zone lookup failed"; echo "$resp"; exit 1; }
  CF_ZONE_ID="$(sed -n "s/.*\"id\":\"\([a-f0-9]\{32\}\)\".*\"name\":\"$ZONE_NAME\".*/\1/p" <<<"$resp" | head -n1)"
  [[ -n "$CF_ZONE_ID" ]] || { echo "❌ Could not parse Zone ID"; echo "$resp"; exit 1; }
  echo "✅ Zone ID: $CF_ZONE_ID"
}

print_env() {
  cat <<EOF
UI_DIR=$UI_DIR
WORKER_DIR=$WORKER_DIR
PAGES_PROJECT=$PAGES_PROJECT
CLOUDFLARE_ACCOUNT_ID=$CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN=${CLOUDFLARE_API_TOKEN:+***}
CF_ZONE_ID=$CF_ZONE_ID
ZONE_NAME=$ZONE_NAME
VOL_DOMAIN=$VOL_DOMAIN
API_DOMAIN=$API_DOMAIN
PURGE_URLS=${PURGE_URLS[*]}
EOF
}

help() {
  cat <<'EOF'
Usage: ./make.sh <command>

Commands:
  deploy            Deploy API Worker (prod) and Pages UI (prod), then verify
  deploy-api        Deploy API Worker only (prod)
  deploy-ui         Deploy Pages UI only (prod)
  deploy-ui-worker  (optional) Deploy UI Worker (if you proxy /api/*)
  verify            Quick production smoke checks
  purge-all         Purge entire Cloudflare cache for the zone
  purge-urls        Purge specific URLs (see print-env)
  bust              Print cache-busted /config/environments.js URL
  print-env         Show effective configuration
EOF
}

deploy_api() {
  in_repo_root; need npx
  echo "📦 Deploying Worker API → PRODUCTION"
  ( cd "$WORKER_DIR" && npx wrangler deploy --env production )
  echo "✅ API deployed"
}

deploy_ui() {
  in_repo_root; need npx
  [[ -n "$PAGES_PROJECT" ]] || { echo "❌ PAGES_PROJECT/PROJECT not set"; exit 1; }
  echo "🌐 Deploying Pages UI → PRODUCTION (project: $PAGES_PROJECT)"
  npx wrangler pages deploy "$UI_DIR" --project-name "$PAGES_PROJECT" --commit-dirty=true
  echo "✅ UI deployed"
}

deploy_ui_worker() {
  in_repo_root; need npx
  echo "🧩 Deploying UI Worker (prod)…"
  ( cd "$UI_DIR" && npx wrangler deploy --env production )
  echo "✅ UI Worker deployed"
}

verify() {
  need curl
  echo "🔎 Verifying prod endpoints…"
  echo "• UI root:  $VOL_DOMAIN"
  echo "• API ping: $API_DOMAIN/api/ping"
  echo "• Auth cfg: $API_DOMAIN/auth/config"
  echo "---"
  code=$(curl -s -o /dev/null -w "%{http_code}" "$VOL_DOMAIN"); echo "UI status: $code"
  code=$(curl -s -o /dev/null -w "%{http_code}" "$API_DOMAIN/api/ping"); echo "API ping: $code (302 if Access-protected)"
  code=$(curl -s -o /dev/null -w "%{http_code}" "$API_DOMAIN/auth/config"); echo "Auth cfg: $code"
}

purge_all() {
  need curl; resolve_zone
  echo "🧹 Purging ALL cache for zone $CF_ZONE_ID…"
  curl -sS -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/purge_cache" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" \
    --data '{"purge_everything":true}'
  echo; echo "✅ Purge Everything requested"
}

purge_urls() {
  need curl; resolve_zone
  echo "🧽 Purging URLs for zone $CF_ZONE_ID:"
  for u in "${PURGE_URLS[@]}"; do echo "  - $u"; done
  local files_json
  files_json=$(printf '"%s",' "${PURGE_URLS[@]}"); files_json="[${files_json%,}]"
  curl -sS -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/purge_cache" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" \
    --data "{\"files\": $files_json}"
  echo; echo "✅ URL purge requested"
}

bust() {
  ts=$(date +%s)
  echo "$VOL_DOMAIN/config/environments.js?v=$ts"
}

deploy() {
  deploy_api
  deploy_ui
  verify
  echo "🎉 Done."
}

cmd="${1:-help}"
case "$cmd" in
  help|-h|--help) help ;;
  print-env)      print_env ;;
  deploy)         deploy ;;
  deploy-api)     deploy_api ;;
  deploy-ui)      deploy_ui ;;
  deploy-ui-worker) deploy_ui_worker ;;
  verify)         verify ;;
  purge-all)      purge_all ;;
  purge-urls)     purge_urls ;;
  bust)           bust ;;
  *) echo "Unknown command: $cmd"; echo; help; exit 1 ;;
esac
