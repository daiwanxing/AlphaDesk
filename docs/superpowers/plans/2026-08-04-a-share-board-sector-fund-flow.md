# A股盘面 · 板块资金流向 Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or executing-plans. Steps use checkbox syntax.

**Goal:** 在 `/turnover` 增加行业板块盘中资金流向，导航改名为「A股盘面」。

**Architecture:** 新 HTTP 云函数 `get-sector-fund-flow` 代理东财 clist + fflow；前端独立 feature + hook，与量能并行轮询。

**Tech Stack:** TypeScript、Vitest、CloudBase HTTP、ECharts、现有终端壳 SCSS。

**Spec:** `docs/superpowers/specs/2026-08-04-a-share-board-sector-fund-flow-design.md`

---

### Task 1: Contract

- Create: `packages/contracts/sector-fund-flow.ts`
- Test: `packages/contracts/sector-fund-flow.test.ts`

### Task 2: Cloud function

- Create: `cloudfunctions/get-sector-fund-flow/`（eastmoney、select、service、http、index、tests、package.json、scf_bootstrap）
- Modify: `cloudfunctions/functions.json`、`scripts/cloudfunctions-manifest.test.ts`

### Task 3: Frontend path + service + feature

- Modify: `src/shared/config/cloudbase.ts`、`src/services/index.ts`
- Create: `src/services/sector-fund-flow/`、`src/features/sector-fund-flow/`

### Task 4: Page compose + rename

- Modify: `src/routes/turnover.tsx`、`TurnoverBoard` 标题/分区、`__root.tsx` 导航文案
