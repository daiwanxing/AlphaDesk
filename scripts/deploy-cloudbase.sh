#!/usr/bin/env bash
# Deploy CloudBase static hosting + cloud functions (CI / local).
# Requires: logged-in tcb CLI, env TCB_ENV_ID (or cloudbaserc.json envId).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_ID="${TCB_ENV_ID:-trader-d4gl4d7a1cb6baebb}"
CF_ROOT="$ROOT/cloudfunctions"
MODE="${1:-all}" # all | hosting | functions

HTTP_FNS=(get-events get-briefs trigger-backfill)
EVENT_FNS=(detect-new-materials generate-brief)

deploy_functions() {
  echo "==> Build cloud functions (TypeScript → index.js)"
  pnpm cf:build

  echo "==> Install production deps where package.json has dependencies"
  for fn in get-briefs trigger-backfill generate-brief detect-new-materials; do
    pkg="$CF_ROOT/$fn/package.json"
    if [[ -f "$pkg" ]] && grep -q '"dependencies"' "$pkg"; then
      echo "    npm install --omit=dev ($fn)"
      (cd "$CF_ROOT/$fn" && npm install --omit=dev --no-fund --no-audit)
    fi
  done

  # Functions already exist in env — do NOT pass --httpFn on update
  # (type is locked; --httpFn can break updates). scf_bootstrap stays in the package.
  echo "==> Deploy functions → $ENV_ID"
  for fn in "${HTTP_FNS[@]}" "${EVENT_FNS[@]}"; do
    echo "---- tcb fn deploy $fn ----"
    if ! tcb fn deploy "$fn" --env-id "$ENV_ID" --yes --force; then
      echo "::error::Failed deploying function: $fn"
      echo "---- tcb fn detail $fn (best effort) ----"
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
