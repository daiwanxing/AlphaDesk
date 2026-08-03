# DDD Architecture Convergence Implementation Plan

> **For agentic workers:** Implement this plan task-by-task with tests and checkpoints. Do not change public HTTP paths or market-turnover data semantics.

**Goal:** Introduce domain-driven boundaries incrementally while preserving the current frontend behavior, CloudBase function names, and API response contracts.

**Architecture:** Keep each CloudBase function independently deployable. Share only platform-neutral domain rules and explicit contracts; keep provider adapters, CloudBase access, HTTP handling, and React UI at the edges. Start with the low-risk P0 boundary fixes, then use `market-turnover` as the first vertical DDD pilot.

**Tech Stack:** TypeScript, React, TanStack Router, Vitest, CloudBase Node SDK, esbuild, Bash deployment scripts.

---

## Scope guardrails

- Keep `/get-events`, `/get-briefs`, `/get-market-turnover`, and `/trigger-backfill` paths unchanged.
- Keep `MarketTurnoverResponse`, the pre-open historical fallback, and the live same-time comparison semantics unchanged.
- Deliberately add one final data refresh when the local session changes from `continuous` to `lunch` or `closed`; this fixes stale boundary state without changing response semantics.
- Do not merge `detect-new-materials` with `generate-brief`.
- Do not introduce a global Zustand store or a repository abstraction for every frontend request.
- Do not move server-only configuration or credentials into `src/shared`.
- Do not commit automatically; the user requested implementation, not a commit.

## Task 1: Make cloud-function boundaries explicit

**Files:**

- Create: `cloudfunctions/functions.json`
- Create: `cloudfunctions/get-events/tsconfig.json`
- Create: `scripts/cloudfunctions-manifest.mjs`
- Create: `scripts/cloudfunctions-manifest.test.ts`
- Modify: `package.json`
- Modify: `cloudfunctions/tsconfig.json`
- Modify: `scripts/build-cloudfunctions.mjs`
- Modify: `scripts/deploy-cloudbase.sh`

- [x] Write a manifest test that asserts all six current function directories are represented exactly once and that unknown manifest entries fail validation.
- [x] Run the focused test and verify it fails because the manifest loader does not exist.
- [x] Add a single JSON manifest with `http` and `event` function names.
- [x] Make the build script read and validate the manifest instead of discovering directories independently.
- [x] Make the deploy script derive `HTTP_FNS` and `EVENT_FNS` from the same manifest through Node.
- [x] Keep the shared Cloud Functions tsconfig focused on CloudBase-local modules; add a dedicated `get-events/tsconfig.json` with `module: ESNext`, `moduleResolution: Bundler`, `allowImportingTsExtensions: true`, `rootDir: ../..`, and explicit `server/` includes for its intentional dependency.
- [x] Keep the esbuild target/runtime unchanged for this typecheck split; the dedicated config validates source types while the existing bundle remains the deployment artifact.
- [x] Make `cf:typecheck` run both configs, so `get-events` is checked without forcing incompatible Node16/rootDir settings onto the other functions.
- [x] Run the focused manifest test and `pnpm cf:typecheck`; both should pass and typecheck all six function entrypoints.

## Task 2: Lock market-turnover behavior before moving files

**Files:**

- Create: `cloudfunctions/get-market-turnover/http.ts`
- Test: `cloudfunctions/get-market-turnover/http.test.ts`
- Modify: `cloudfunctions/get-market-turnover/eastmoney.ts`
- Modify: `cloudfunctions/get-market-turnover/index.ts`

- [x] First isolate the HTTP handler from `server.listen(9000)` so tests can import it without binding a port.
- [ ] Add contract fixtures for pre-open fallback, live comparison, `snapshotTradeDate`, `asOf`, `prevTradeDate`, empty series, missing market data, and market order.
- [x] Run the focused contract test and verify it fails for a real missing or unexposed boundary, not because importing the module starts a server.
- [x] Keep the current response and fallback behavior unchanged while making the handler testable.
- [x] Run the contract test and existing provider/series tests before any file move.

## Task 3: Establish the market-turnover domain seam

**Files:**

- Create: `cloudfunctions/get-market-turnover/market-config.ts`
- Create: `cloudfunctions/get-market-turnover/domain/turnover-policy.ts`
- Modify: `cloudfunctions/get-market-turnover/eastmoney.ts`
- Modify: `cloudfunctions/get-market-turnover/index.ts`
- Test: `cloudfunctions/get-market-turnover/domain/turnover-policy.test.ts`

- [x] Write failing tests for snapshot-session selection, comparison-mode selection, full-day fallback disclaimer, and kline-only disclaimer.
- [x] Run the focused test and verify the failure is caused by the missing domain module.
- [x] Move market definitions out of the provider module into `market-config.ts`.
- [x] Extract pure comparison/session policy into `domain/turnover-policy.ts`.
- [x] Keep Eastmoney/Tencent URL construction and parsing in the provider module.
- [x] Update the application orchestrator to consume the domain policy without changing response fields.
- [x] Run focused domain/provider tests and the existing turnover tests.

## Task 4: Separate market-turnover application and infrastructure responsibilities

**Files:**

- Create: `cloudfunctions/get-market-turnover/application/build-turnover-response.ts`
- Create: `cloudfunctions/get-market-turnover/infrastructure/turnover-repository.ts`
- Create: `cloudfunctions/get-market-turnover/infrastructure/providers/tencent.ts`
- Modify: `cloudfunctions/get-market-turnover/index.ts`
- Modify: `cloudfunctions/get-market-turnover/eastmoney.ts`
- Test: `cloudfunctions/get-market-turnover/application/build-turnover-response.test.ts`

- [ ] Add provider/repository fakes for pre-open fallback, live comparison, missing provider data, and cache read/write behavior.
- [ ] Move `pipeline_meta` reads/writes behind a focused repository interface.
- [ ] Move Tencent day-minute fetching behind a provider module.
- [ ] Move response assembly and market-session orchestration into the application module.
- [ ] Leave `index.ts` responsible only for HTTP parsing, status codes, and invoking the application use case.
- [ ] Keep all legacy route aliases (`/`, `/briefs`, `/events`, `/backfill`) and `/health` behavior covered.
- [ ] Run the application tests and all cloud-function tests.

## Task 5: Move frontend lifecycle out of routes

**Files:**

- Create: `src/features/market-turnover/useMarketTurnover.ts`
- Modify: `src/routes/turnover.tsx`
- Modify: `src/features/market-turnover/cache.ts`
- Test: `src/features/market-turnover/useMarketTurnover.test.ts`

- [x] Write failing tests for initial cache display, continuous-session polling, and the deliberate one-time refresh when entering `lunch` or `closed`.
- [ ] Add lifecycle tests for abort, stale responses, backoff, and unmount cleanup.
- [x] Extract the current request, abort, backoff, cache, and session-watch lifecycle into the feature hook.
- [x] Make the route only read config, call the hook, and render `TurnoverBoard`.
- [x] Preserve the distinction between local current session and server snapshot session.
- [x] On a `continuous → lunch/closed` transition, perform one final `load()` before stopping future polling; do not refresh repeatedly during the non-continuous session.
- [x] Add a full-sequence cache signature so changes to middle series points cannot be silently ignored.
- [x] Keep the 250ms loading assertion in `LoadingOverlay.test.tsx` / `TurnoverBoard.test.tsx`, because the delay is UI behavior rather than hook behavior.
- [x] Run the focused hook/cache tests and existing frontend tests.

## Task 6: Add cross-runtime contracts as a separate follow-up

**Files:**

- Create: `packages/contracts/market-turnover.ts`
- Create: `packages/contracts/event-briefs.ts`
- Create: `cloudfunctions/_shared/runtime-config.ts`
- Modify: `package.json`
- Modify: `tsconfig.app.json`
- Modify: `cloudfunctions/tsconfig.json`
- Modify: `scripts/build-cloudfunctions.mjs`
- Modify: `src/features/market-turnover/types.ts`
- Modify: `src/features/event-track/types.ts`
- Modify: `cloudfunctions/get-briefs/index.ts`
- Modify: `cloudfunctions/detect-new-materials/index.ts`
- Modify: `cloudfunctions/generate-brief/index.ts`
- Modify: `cloudfunctions/get-market-turnover/index.ts`
- Modify: `cloudfunctions/trigger-backfill/index.ts`

- [ ] Define the workspace/package resolution strategy before adding imports.
- [ ] Define platform-neutral public response and persisted-document types.
- [ ] Add explicit mappers from database rows to public DTOs.
- [ ] Centralize all server-only environment ID and runtime configuration access.
- [ ] Keep React-only display types and server-only job internals out of the same contract.
- [ ] Add fixed-fixture contract tests for required fields, optional fields, and status values.

## Verification

- [x] `pnpm test`
- [x] `pnpm build`
- [x] `pnpm cf:typecheck`
- [x] `pnpm cf:build`
- [ ] `pnpm lint` and record any pre-existing baseline issues separately
- [ ] `pnpm format:check` and record any pre-existing baseline issues separately
- [x] Inspect `git diff` for unchanged public paths, response fields, and data semantics

Current baseline notes: `pnpm lint` remains blocked by existing `no-console` errors in
`scripts/build-cloudfunctions.mjs`; `pnpm format:check` remains blocked by pre-existing
format issues outside this change set. All changed files pass targeted formatting and IDE
diagnostic checks.
