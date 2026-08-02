# A-share Market Turnover Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增加并列入口「A股量能」页：经 CloudBase HTTP 代理展示沪/深/京成交额及较上一日全天增减；盘中 15s 轮询，休市/周末有明确 UI 且不轮询。

**Architecture:** 前端 `/turnover` + 根导航；`get-market-turnover` HTTP 云函数拉东财 `push2`/`push2his`（O(1) 实时 + 昨收日 K 按日缓存于 `pipeline_meta`）；无 Timer 写库。UI 优先 HeroUI。

**Tech Stack:** React 19 + TanStack Router + HeroUI 3、Vite、CloudBase HTTP Function（TypeScript + 现有 `pnpm cf:build`）、Vitest、东财公开行情。

**Spec:** `docs/superpowers/specs/2026-08-02-a-share-market-turnover-design.md`

**Locked choices (from spec review):**

- Routes: `/` = 事件追踪，`/turnover` = A股量能
- 标的：沪 `1.000001` 上证指数；深 `0.399001` 深证成指（UI 标注「成指口径」）；京 `0.899050` 北证50
- Env: `VITE_CLOUDBASE_TURNOVER_URL`（与 briefs/events 命名一致）
- Errors: 对齐 `get-briefs` → HTTP 500 + `{ error }`（成功体可含 `ok: true`）
- 昨收缓存：`pipeline_meta` 文档 `_id: "turnover"`（勿覆盖 `detect`）
- Commits: 仅当用户明确要求时执行计划中的 Commit 步骤

---

## File map

| Path                                                        | Responsibility                                            |
| ----------------------------------------------------------- | --------------------------------------------------------- |
| `cloudfunctions/get-market-turnover/index.ts`               | HTTP：代理东财、昨收缓存、聚合响应                        |
| `cloudfunctions/get-market-turnover/package.json`           | 依赖 `@cloudbase/node-sdk`（同 get-briefs）               |
| `cloudfunctions/get-market-turnover/eastmoney.ts`           | 东财 ulist + kline 请求与解析                             |
| `cloudfunctions/get-market-turnover/session.ts`             | 上海时区 session 判定（可单测）                           |
| `src/features/market-turnover/types.ts`                     | API / UI 类型                                             |
| `src/features/market-turnover/session.ts`                   | 前端 session 辅助（与云函数逻辑对齐的纯函数，或共享复制） |
| `src/features/market-turnover/format.ts`                    | 成交额格式化、delta 文案                                  |
| `src/features/market-turnover/api.ts`                       | `fetchMarketTurnover()`                                   |
| `src/features/market-turnover/components/TurnoverBoard.tsx` | HeroUI 看板（三卡+合计+徽章）                             |
| `src/features/market-turnover/session.test.ts`              | 周末/午休/盘中判定单测                                    |
| `src/features/market-turnover/format.test.ts`               | 格式化单测                                                |
| `src/routes/turnover.tsx`                                   | 路由页 + 15s 轮询生命周期                                 |
| `src/routes/__root.tsx`                                     | 主导航：事件追踪 \| A股量能                               |
| `.env.example` / `.env.production.cloudbase.example`        | `VITE_CLOUDBASE_TURNOVER_URL`                             |
| `scripts/deploy-cloudbase.sh`                               | `HTTP_FNS` 加入 `get-market-turnover`                     |
| `scripts/build-cloudfunctions.mjs`                          | 若需显式列举则加入该函数（跟随现有约定）                  |

---

### Task 0: Session + format 纯函数（TDD）

**Files:**

- Create: `src/features/market-turnover/session.ts`
- Create: `src/features/market-turnover/format.ts`
- Create: `src/features/market-turnover/session.test.ts`
- Create: `src/features/market-turnover/format.test.ts`

- [ ] **Step 1: 写失败单测 — session**

覆盖至少：

- 工作日 10:00 → `continuous`
- 工作日 12:00 → `lunch`
- 工作日 16:00 → `closed`
- 周六任意 → `weekend`

用固定 `Date` 注入（函数签名接受 `now: Date`），时区按 Asia/Shanghai 解释（可用显式 offset 或 `Temporal`/手工拆解北京时间，避免依赖本机 TZ）。

- [ ] **Step 2: 跑测确认失败**

Run: `pnpm exec vitest run src/features/market-turnover/session.test.ts`  
Expected: FAIL（模块不存在或函数未定义）

- [ ] **Step 3: 实现 `resolveMarketSession(now: Date)`**

返回 union：`pre_open | continuous | lunch | closed | weekend`（第一版可不单独 `holiday`）。

- [ ] **Step 4: 跑测通过**

Run: `pnpm exec vitest run src/features/market-turnover/session.test.ts`  
Expected: PASS

- [ ] **Step 5: 写 format 单测 + 实现**

`formatAmountYuan(n)` → 亿/万亿中文；`formatDelta(delta, pct)` → 带符号文案。  
Run: `pnpm exec vitest run src/features/market-turnover/format.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit（仅用户要求时）**

---

### Task 1: 类型 + API client

**Files:**

- Create: `src/features/market-turnover/types.ts`
- Create: `src/features/market-turnover/api.ts`
- Modify: `.env.example`
- Modify: `.env.production.cloudbase.example`

- [ ] **Step 1: 定义响应类型**

对齐 spec §4.1：`markets[]`、`total`、`session`、`disclaimer`、`asOf`、`compareMode`；休市时可多字段如 `snapshotTradeDate?: string`。

- [ ] **Step 2: 实现 `fetchMarketTurnover()`**

```ts
const base = import.meta.env.VITE_CLOUDBASE_TURNOVER_URL;
if (!base) throw new Error("VITE_CLOUDBASE_TURNOVER_URL is not set");
const res = await fetch(base);
if (!res.ok) throw new Error(/* body */);
return res.json();
```

- [ ] **Step 3: 更新 env 示例**

```bash
VITE_CLOUDBASE_TURNOVER_URL=
# 生产示例：
# VITE_CLOUDBASE_TURNOVER_URL=https://trader-d4gl4d7a1cb6baebb-1301814349.tcloudbaseapp.com/get-market-turnover
```

- [ ] **Step 4: Commit（仅用户要求时）**

---

### Task 2: HeroUI 看板 + `/turnover` 路由 + 根导航

**Files:**

- Create: `src/features/market-turnover/components/TurnoverBoard.tsx`
- Create: `src/routes/turnover.tsx`
- Modify: `src/routes/__root.tsx`
- Optional: `src/features/market-turnover/market-turnover.scss`（仅当 HeroUI 不够用时）

- [ ] **Step 1: 实现 `TurnoverBoard`**

用 HeroUI：`Card` 三列、`Chip` 会话徽章、`Button` 手动刷新、`Spinner` 加载、错误用可见提示。  
按 `session` 切换文案（周末：「周末休市」+ 上交易日标签；盘中：较上日进度提示）。

- [ ] **Step 2: 实现 `turnover` 路由**

- mount：拉取一次
- `session === "continuous"`：`setInterval` 15s；否则清 timer
- unmount / session 离开 continuous：`clearInterval`
- 失败：保留上一帧 + 错误信息

- [ ] **Step 3: 根布局导航**

```tsx
<nav>
  <Link to="/">事件追踪</Link>
  <Link to="/turnover">A股量能</Link>
</nav>
```

Active 态可用 `useRouterState` / `Link` activeProps。品牌副标题可略调或保持。

- [ ] **Step 4: 本地冒烟**

Run: `pnpm run dev`  
打开 `/` 与 `/turnover` 切换；周末应看到休市徽章且 Network 无 15s 重复请求（可临时 mock API）。

- [ ] **Step 5: Commit（仅用户要求时）**

---

### Task 3: CloudFunction `get-market-turnover`

**Files:**

- Create: `cloudfunctions/get-market-turnover/index.ts`（listen 9000，**不**手写 CORS）
- Create: `cloudfunctions/get-market-turnover/eastmoney.ts`
- Create: `cloudfunctions/get-market-turnover/session.ts`（可与前端同逻辑复制，注释「keep in sync」）
- Create: `cloudfunctions/get-market-turnover/package.json`
- Modify: `scripts/deploy-cloudbase.sh` — `HTTP_FNS` 追加 `get-market-turnover`
- Verify: `scripts/build-cloudfunctions.mjs` 能发现并 bundle 该函数

- [ ] **Step 1: eastmoney 客户端**

- Realtime: `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&secids=1.000001,0.399001,0.899050&fields=f12,f13,f14,f6`  
  Header: 合理 `User-Agent` + `Referer: https://quote.eastmoney.com/`
- Prev day: `push2his` kline `klt=101`，取上一交易日 `amount` 字段（kline CSV 段）
- 超时与错误向上抛

- [ ] **Step 2: 昨收缓存**

`pipeline_meta` doc `_id: "turnover"` 结构示例：

```ts
{
  _id: "turnover",
  prevBySecId: {
    "1.000001": { tradeDate: "2026-08-01", amount: number },
    // ...
  },
  updatedAt: string
}
```

若缓存 tradeDate 已是「相对今日的上一交易日」则跳过 kline。

- [ ] **Step 3: HTTP handler**

`GET /` | `/get-market-turnover` | `/health`  
组装 markets + total + session + disclaimer；周末路径以日 K 快照为主（见 spec §2.4）。  
失败：`sendJson(res, 500, { error })`。

- [ ] **Step 4: 构建**

Run: `pnpm cf:typecheck && pnpm cf:build`  
Expected: `get-market-turnover` bundle 成功

- [ ] **Step 5: 部署（需云环境）**

按现有流程部署 HTTP 函数并绑定网关路径 `/get-market-turnover`（与 get-briefs 相同方式）。  
填写 `.env.local` / production URL。

- [ ] **Step 6: 冒烟**

```bash
curl -sS "$VITE_CLOUDBASE_TURNOVER_URL" | head
```

Expected: JSON 含 `markets` 长度 3、`session` 字段。

- [ ] **Step 7: Commit（仅用户要求时）**

---

### Task 4: 验收对照

**Files:** 无代码，或小修 UI 文案

- [ ] **Step 1: 对照 spec §7 手工勾选**

含：双导航、周末徽章与快照标签、盘中 15s、离开页停轮询、无 Timer。

- [ ] **Step 2: 全量测试**

Run: `pnpm test && pnpm build`  
Expected: PASS

- [ ] **Step 3: Commit（仅用户要求时）**

---

## Risk notes

- 东财无 SLA：保持 O(1) 请求 + 昨收缓存；失败退避。
- 深市成指 ≠ 全深市：UI 必须标注口径。
- `pipeline_meta` 两文档：`detect` 与 `turnover` 勿互相 `set` 覆盖。
- HeroUI v3 API 以当前 `@heroui/react@3.2.x` 文档为准，实现前核对 Card/Chip 导出名。
