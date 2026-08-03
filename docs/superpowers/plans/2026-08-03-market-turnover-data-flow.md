# A 股量能分时数据流修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让盘前/休市使用「上一交易日 vs 再上一交易日」的完整分时序列，开盘后切换为「今日实时累计 vs 上一交易日同时刻累计」，并避免把 Eastmoney 的单点空响应误判为成功。

**Architecture:** 云函数按响应覆盖范围选择 `trends2` host；盘前请求 3 个交易日，过滤当日不完整数据后保留两个历史交易日。若 Eastmoney 分时完全不可用，使用已有日 K 与腾讯沪深分时、北证按日 K 终点缩放的兜底生成历史曲线；前端按 `series.prev` 是否存在显示对比曲线，不再用 `compareMode` 隐藏有效的休市快照曲线。

**Tech Stack:** TypeScript、CloudBase HTTP 云函数、React、Vitest、ECharts。

---

## 文件地图

- 修改 `cloudfunctions/get-market-turnover/eastmoney.ts`：允许 `ndays=3`，校验有效交易日覆盖范围后再进行 host failover。
- 修改 `cloudfunctions/get-market-turnover/index.ts`：盘前请求三日数据，使用 `Promise.allSettled` 进入快照兜底，并让日 K 快照补齐两条历史分时曲线。
- 修改 `cloudfunctions/get-market-turnover/eastmoney.test.ts`：验证单日空响应会跳过并使用历史 host。
- 复用 `cloudfunctions/get-market-turnover/series.test.ts`：保持盘前两日选择契约。
- 修改 `src/features/market-turnover/components/TurnoverBoard.tsx`：只要存在对比序列就显示橙色曲线。
- 新增 `src/features/market-turnover/components/TurnoverBoard.test.tsx`：验证盘前已有 `series.prev` 时渲染对比曲线。
- 修改 `cloudfunctions/get-market-turnover/session.ts`、`src/features/market-turnover/session.ts`、`src/routes/turnover.tsx`：移除上一轮调试埋点。
- 新增本计划文档：记录数据流和验证命令。

---

### Task 1: 锁定 `trends2` host 覆盖范围契约

**Files:**

- Create: `cloudfunctions/get-market-turnover/eastmoney.test.ts`

- [x] 写测试：首两个 host 仅返回单日数据时，`fetchTrends2(..., 3)` 必须继续请求 `push2his`。
- [x] 运行 `pnpm exec vitest run cloudfunctions/get-market-turnover/eastmoney.test.ts`，确认测试因当前实现过早返回而失败。
- [x] 保持测试不依赖实网，只 mock `fetch` 返回不同 host 的响应。

### Task 2: 修复 Eastmoney host 选择

**Files:**

- Modify: `cloudfunctions/get-market-turnover/eastmoney.ts`
- Test: `cloudfunctions/get-market-turnover/eastmoney.test.ts`

- [x] 将 `ndays` 扩展为 `2 | 3`。
- [x] 将盘前 `ndays=3` 的趋势响应成功标准改为至少包含两个有效交易日；实时 `ndays=2` 仍允许单日响应交给缓存兜底。
- [x] 只有通过覆盖范围校验才返回当前 host；否则继续尝试下一个 host。
- [x] 运行 Task 1 测试，确认通过。

### Task 3: 接入盘前三日请求与失败降级

**Files:**

- Modify: `cloudfunctions/get-market-turnover/index.ts`
- Verify: `cloudfunctions/get-market-turnover/series.test.ts` 的日期选择契约

- [x] `pre_open` / `weekend` 请求 `ndays=3`，连续竞价、午休、收盘请求 `ndays=2`。
- [x] 用 `Promise.allSettled` 收集三市结果；快照场景中任一市场取数失败时进入日 K 快照兜底，不再直接返回 500。
- [x] 盘前过滤当前自然日后，少于两个历史交易日时进入同一兜底。
- [x] 保持盘中语义：主序列为今日，橙线为上一交易日同时刻。
- [x] 运行云函数类型检查和相关单测。

### Task 4: 让日 K 快照补齐两条历史曲线

**Files:**

- Modify: `cloudfunctions/get-market-turnover/index.ts`
- Verify: `cloudfunctions/get-market-turnover/series.test.ts` 的纯函数契约

- [x] 复用每个市场已加载的日 K 结果，取最近两个历史交易日的北证终点。
- [x] 通过腾讯沪深多日分时合并，并按北证日 K 终点比例缩放，生成两个完整历史序列。
- [x] 两条曲线都可用时返回 `series.today` / `series.prev`，并保持 KPI 使用两个历史日全天终点。
- [x] 备用源也失败时保留现有“仅全天成交额”降级，不让错误掩盖可用 KPI。

### Task 5: 修复前端对比曲线显示

**Files:**

- Modify: `src/features/market-turnover/components/TurnoverBoard.tsx`
- Create: `src/features/market-turnover/components/TurnoverBoard.test.tsx`

- [x] 先写测试：`pre_open` + 非空 `series.prev` 时，`IntradayTurnoverChart` 收到 `showPrev=true`。
- [x] 运行测试确认当前 `compareMode` 限制导致失败。
- [x] 改为 `series.prev.length > 0` 即显示对比曲线，保持无对比序列时单线降级。
- [x] 运行前端相关测试与类型检查。

### Task 6: 清理调试埋点并完成验证

**Files:**

- Modify: `cloudfunctions/get-market-turnover/eastmoney.ts`
- Modify: `cloudfunctions/get-market-turnover/session.ts`
- Modify: `src/features/market-turnover/session.ts`
- Modify: `src/routes/turnover.tsx`

- [x] 删除上一轮发送到本地 ingest 地址的调试请求及仅为埋点引入的状态改写。
- [x] 运行：
  - `pnpm exec vitest run cloudfunctions/get-market-turnover/series.test.ts cloudfunctions/get-market-turnover/eastmoney.test.ts src/features/market-turnover/components/TurnoverBoard.test.tsx`
  - `pnpm cf:typecheck`
  - `pnpm exec tsc -p tsconfig.app.json --noEmit`
  - `pnpm exec oxlint cloudfunctions/get-market-turnover/eastmoney.ts cloudfunctions/get-market-turnover/index.ts src/features/market-turnover/components/TurnoverBoard.tsx`
  - `pnpm exec oxfmt --check`（改动文件）
- [x] 检查 `git diff --check`，确认无空白错误。

全量 `pnpm lint` / `pnpm format:check` 仍受仓库既有脚本与文档问题影响；改动文件的 scoped lint/format 已通过。
云函数组装层没有新增集成测试，当前由 host failover 单测、既有纯函数单测、类型检查和线上网关烟测覆盖。

---

## 验收语义

- 盘前：主曲线 `7/31`，对比曲线 `7/30`，KPI 为两日全天成交额。
- 开盘后：主曲线切到 `8/3` 最新累计，对比曲线为 `7/31` 同时刻累计。
- `push2delay` / `push2` 只有单条当前点时，不得被视为足够数据。
- Eastmoney 分时不可用时，盘前仍优先返回可用 KPI，尽量显示两条腾讯/日 K 兜底曲线。
