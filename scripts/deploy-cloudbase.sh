#!/usr/bin/env bash
# Deploy CloudBase static hosting + cloud functions (CI / local).
# Requires: logged-in tcb CLI, env TCB_ENV_ID (or cloudbaserc.json envId).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_ID="${TCB_ENV_ID:-trader-d4gl4d7a1cb6baebb}"
CF_ROOT="$ROOT/cloudfunctions"

HTTP_FNS=(get-events get-briefs trigger-backfill)
EVENT_FNS=(detect-new-materials generate-brief)

echo "==> Build cloud functions (TypeScript → index.js)"
pnpm cf:build

echo "==> Install production deps for HTTP functions that need them"
for fn in get-briefs trigger-backfill generate-brief detect-new-materials; do
  pkg="$CF_ROOT/$fn/package.json"
  if [[ -f "$pkg" ]] && grep -q '"dependencies"' "$pkg"; then
    echo "    npm install --omit=dev ($fn)"
    (cd "$CF_ROOT/$fn" && npm install --omit=dev --no-fund --no-audit)
  fi
done

echo "==> Deploy HTTP functions → $ENV_ID"
for fn in "${HTTP_FNS[@]}"; do
  echo "    tcb fn deploy $fn --httpFn"
  tcb fn deploy "$fn" --httpFn --env-id "$ENV_ID" --yes
done

echo "==> Deploy Event functions → $ENV_ID"
for fn in "${EVENT_FNS[@]}"; do
  echo "    tcb fn deploy $fn"
  tcb fn deploy "$fn" --env-id "$ENV_ID" --yes
done

echo "==> Deploy static hosting (./dist) → $ENV_ID"
if [[ ! -d dist ]]; then
  echo "error: dist/ missing; run pnpm build:cloudbase first" >&2
  exit 1
fi
tcb hosting deploy ./dist --env-id "$ENV_ID" --yes

echo "==> Done"
echo "    Site: https://${ENV_ID}-1301814349.tcloudbaseapp.com/"
