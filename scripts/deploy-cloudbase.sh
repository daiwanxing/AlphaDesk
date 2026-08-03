#!/usr/bin/env bash
# Deploy CloudBase static hosting + cloud functions (CI / local).
# Requires: logged-in tcb CLI, env TCB_ENV_ID (or cloudbaserc.json envId).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_ID="${TCB_ENV_ID:-trader-d4gl4d7a1cb6baebb}"
CF_ROOT="$ROOT/cloudfunctions"
MODE="${1:-all}" # all | hosting | functions

manifest_group() {
  node "$ROOT/scripts/cloudfunctions-manifest.mjs" "$1"
}

HTTP_FNS=()
while IFS= read -r fn; do
  [[ -n "$fn" ]] && HTTP_FNS+=("$fn")
done < <(manifest_group http)

EVENT_FNS=()
while IFS= read -r fn; do
  [[ -n "$fn" ]] && EVENT_FNS+=("$fn")
done < <(manifest_group event)

ALL_FNS=("${HTTP_FNS[@]}" "${EVENT_FNS[@]}")

# Prefer zip for small packages (avoids flaky COS upload timeout in CI).
# Falls back to cos with retries if zip fails (e.g. >1.5MB).
update_function_code() {
  local fn="$1"
  local attempt
  echo "---- tcb fn code update $fn (zip) ----"
  if tcb fn code update "$fn" --env-id "$ENV_ID" --deployMode zip --yes; then
    return 0
  fi
  echo "zip update failed for $fn; retrying with cos..."
  for attempt in 1 2 3; do
    echo "---- tcb fn code update $fn (cos attempt $attempt) ----"
    if tcb fn code update "$fn" --env-id "$ENV_ID" --deployMode cos --yes; then
      return 0
    fi
    sleep $((attempt * 5))
  done
  return 1
}

deploy_functions() {
  echo "==> Build cloud functions (TypeScript → index.js)"
  pnpm cf:build

  # Do NOT upload node_modules: keep packages small for --deployMode zip.
  # Cloud runtime installs from each function's package.json (installDependency).
  echo "==> Skipping local npm install in function dirs (cloud installs deps)"

  echo "==> Ensure no stray node_modules under cloudfunctions (zip size)"
  find "$CF_ROOT" -type d -name node_modules -prune -exec rm -rf {} + 2>/dev/null || true

  echo "==> Update function code → $ENV_ID (functionRoot=cloudfunctions)"
  for fn in "${ALL_FNS[@]}"; do
    if [[ ! -f "$CF_ROOT/$fn/index.js" ]]; then
      echo "::error::Missing $CF_ROOT/$fn/index.js — run pnpm cf:build"
      exit 1
    fi
    # Show package size hint
    du -sh "$CF_ROOT/$fn" || true
    if ! update_function_code "$fn"; then
      echo "::error::Failed updating function code: $fn"
      tcb fn detail "$fn" --env-id "$ENV_ID" || true
      exit 1
    fi
  done
}

deploy_hosting() {
  echo "==> Deploy static hosting (./dist) → $ENV_ID"
  if [[ ! -d dist ]]; then
    echo "error: dist/ missing; run pnpm build:cloudbase first" >&2
    exit 1
  fi
  ls -la dist | head -20
  tcb hosting deploy ./dist --env-id "$ENV_ID" --yes
}

case "$MODE" in
  functions) deploy_functions ;;
  hosting) deploy_hosting ;;
  all)
    deploy_functions
    deploy_hosting
    ;;
  *)
    echo "usage: $0 [all|hosting|functions]" >&2
    exit 2
    ;;
esac

echo "==> Done ($MODE)"
echo "    Site: https://${ENV_ID}-1301814349.tcloudbaseapp.com/"
