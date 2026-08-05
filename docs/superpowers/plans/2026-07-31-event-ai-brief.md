# Event AI Brief (CloudBase) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有事件追踪详情页上增加 AI 解读层：材料可用后由 CloudBase 窗口驱动检测 → 生成一次入库；前端只读展示（三层并列）。

**Architecture:** 全栈腾讯云 CloudBase。时间线由 HTTP Function `get-events`（逻辑源 `server/lib/*`，本地 Vite middleware 同源）提供；静态前端托管在 CloudBase Hosting。文档库存 `briefs`/`jobs`，Event Functions 负责 `detect-new-materials` / `generate-brief`，HTTP Function `get-briefs` / `trigger-backfill` 供前端。检测采用窗口加密 + 日常兜底（非全年无差别高频爬取）。**不再使用 Vercel。**

**Tech Stack:** React 19 + Vite 8（现有前端）、CloudBase 云函数（**TypeScript**，由现有构建链部署时编译）+ 文档型数据库 + `@cloudbase/node-sdk` AI、Vitest（纯逻辑单测）。

**Specs:**

- Product: `docs/superpowers/specs/2026-07-30-event-ai-brief-prd.md`
- Design: `docs/superpowers/specs/2026-07-30-event-ai-brief-cloudbase-design.md`

**Gate:** Task 3 起需要用户提供 CloudBase `envId` 且 MCP/CLI 已登录。Task 0–2、4（前端 fixture）可不依赖云环境。

**Commits:** 本仓库用户规则为「仅在明确要求时 commit」。计划中的 Commit 步骤默认 **跳过**，除非用户说「提交」。

---

## File map

| Path                                                                            | Responsibility                                                            |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `cloudfunctions/get-events/`                                                    | HTTP Function：时间线列表与事件详情（bundle `server/api` + `server/lib`） |
| `cloudfunctions/get-briefs/`                                                    | HTTP Function：只读 briefs                                                |
| `cloudfunctions/detect-new-materials/`                                          | Event Function：窗口检测 + 入队                                           |
| `cloudfunctions/generate-brief/`                                                | Event Function：claim → 抓文 → LLM → 写 briefs                            |
| `cloudfunctions/trigger-backfill/`                                              | HTTP Function：鉴权后对指定 `year` 触发 `detect-new-materials` backfill   |
| `cloudfunctions/_shared/`                                                       | `.ts` 共享：窗口计算、幂等、退避、prompt、DB helpers                      |
| `src/features/event-track/briefs.ts`                                            | 槽位补全 + 产品状态合成（纯函数）                                         |
| `src/features/event-track/api.ts`                                               | `fetchTimeline` / `fetchBriefs` / `requestBriefBackfill`                  |
| `src/features/event-track/types.ts`                                             | Brief 类型                                                                |
| `src/features/event-track/components/AiBriefPanel.tsx`                          | AI 区 UI（占位/撰写中/就绪/失败）                                         |
| `src/routes/events/$eventId.tsx`                                                | 并入三层                                                                  |
| `src/features/event-track/briefs.test.ts`                                       | 状态合成单测                                                              |
| `cloudfunctions/_shared/windows.test.ts` 或 `server/lib/detect-windows.test.ts` | 窗口模式单测（可放仓库根 `src`/`server` 便于 vitest）                     |
| `server/lib/detect-windows.ts`                                                  | 窗口/模式纯逻辑（可被云函数复制或构建时打包）                             |
| `server/api/middleware.ts`                                                      | 本地 `pnpm dev` 时间线（不部署到云）                                      |
| `.env.example` / `.env.production.cloudbase.example`                            | `VITE_CLOUDBASE_EVENTS_URL` 等                                            |
| `cloudbaserc.json`                                                              | 静态托管根目录 `dist/`                                                    |
| `README.md`                                                                     | CloudBase 部署说明                                                        |

### CloudFunctions TypeScript 约定

- **语言：** 只维护 **TypeScript**（`.ts`）。**不要**手写/提交运行时 `.js`。
- **编译：** 部署前执行 `pnpm cf:build`（esbuild → 各函数目录下同名 CommonJS `.js`）。类型检查：`pnpm cf:typecheck`。
- **入口：** Event Function `index.main`（编译后 `exports.main`）；HTTP Function 仍 listen `9000` + `scf_bootstrap`（bootstrap 调 `index.js`）。
- **依赖：** 各函数保留 `package.json`；`@cloudbase/node-sdk` 等写在函数目录。云端 `isWaitInstall` 安装依赖；本地 `cf:build` **不**打包 node_modules。
- **共享：** 后续 `cloudfunctions/_shared/` 用 `.ts`；与 `server/lib/detect-windows.ts` 行为对齐。
- **忽略：** `.gitignore` 忽略 `cloudfunctions/**/*.js`（保留 `scf_bootstrap`）。

---

### Task 0: 确认规格与前置条件清单

**Files:**

- Read: `docs/superpowers/specs/2026-07-30-event-ai-brief-prd.md`
- Read: `docs/superpowers/specs/2026-07-30-event-ai-brief-cloudbase-design.md`

- [ ] **Step 1: 核对已定产品决策**

确认实现必须遵守：三层并列；FOMC 分卡；财报 1 份总结 / FOMC 最多 3 份；未发生=占位；材料已出无 brief=撰写中；失败可见+自动重试；失败耗尽无「将自动重试」；窗口加密+日常兜底；页面不调 LLM。

- [ ] **Step 2: 列出云环境清单（给用户）**

输出给用户确认：

1. CloudBase `envId`
2. MCP/CLI 登录
3. 文档库可建集合
4. AI 模型可用
5. 云函数可出站访问 `data.sec.gov` / `federalreserve.gov`

- [ ] **Step 3: 无代码检查点**

若用户尚未给 `envId`：继续 Task 1–2、4（fixture）；Task 3+ 标记 blocked。

---

### Task 1: 纯逻辑 — 检测窗口模式

**Files:**

- Create: `server/lib/detect-windows.ts`
- Create: `server/lib/detect-windows.test.ts`

- [x] **Step 1: 写失败单测**

```ts
import { describe, expect, it } from "vitest";
import { resolveDetectMode, isInEarningsWindow, isInFomcSlotWindow } from "./detect-windows";

describe("detect-windows", () => {
  it("idle when no windows and daily not due", () => {
    expect(
      resolveDetectMode({
        today: "2026-06-15",
        activeWindows: [],
        lastDailyAt: "2026-06-15T01:00:00.000Z",
        now: "2026-06-15T12:00:00.000Z",
        dailyIntervalHours: 24,
      }),
    ).toBe("idle");
  });

  it("dense when any active window", () => {
    expect(
      resolveDetectMode({
        today: "2026-01-29",
        activeWindows: [{ eventId: "x", slot: "earnings" }],
        lastDailyAt: "2026-01-29T00:00:00.000Z",
        now: "2026-01-29T12:00:00.000Z",
        dailyIntervalHours: 24,
      }),
    ).toBe("dense");
  });

  it("daily when outside windows and interval elapsed", () => {
    expect(
      resolveDetectMode({
        today: "2026-06-15",
        activeWindows: [],
        lastDailyAt: "2026-06-14T00:00:00.000Z",
        now: "2026-06-15T12:00:00.000Z",
        dailyIntervalHours: 24,
      }),
    ).toBe("daily");
  });

  it("earnings window: day before scheduled through 3 days after actual", () => {
    expect(isInEarningsWindow("2026-01-28", { scheduledDate: "2026-01-29" })).toBe(true);
    expect(isInEarningsWindow("2026-02-02", { actualDate: "2026-01-30" })).toBe(true);
    expect(isInEarningsWindow("2026-02-05", { actualDate: "2026-01-30" })).toBe(false);
  });

  it("minutes window roughly day 14–28 after meeting", () => {
    expect(isInFomcSlotWindow("2026-02-05", "2026-01-20", "minutes")).toBe(true);
    expect(isInFomcSlotWindow("2026-01-21", "2026-01-20", "minutes")).toBe(false);
  });
});
```

- [x] **Step 2: 跑测确认失败**

Run: `pnpm exec vitest run server/lib/detect-windows.test.ts`  
Expected: FAIL（模块不存在）— 实现时与 Step 3 一并完成

- [x] **Step 3: 实现 `detect-windows.ts`**

实现设计稿 §3.1.1：`dense` | `daily` | `idle`；财报窗、FOMC statement/minutes/sep 窗；导出供云函数复制或后续打包。

- [x] **Step 4: 跑测通过**

Run: `pnpm exec vitest run server/lib/detect-windows.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit（仅当用户要求）**

```bash
git add server/lib/detect-windows.ts server/lib/detect-windows.test.ts
git commit -m "$(cat <<'EOF'
Add detect-window mode helpers for AI brief pipeline.

EOF
)"
```

---

### Task 2: 纯逻辑 — 前端 brief 状态合成

**Files:**

- Create: `src/features/event-track/briefs.ts`
- Create: `src/features/event-track/briefs.test.ts`
- Modify: `src/features/event-track/types.ts`

- [x] **Step 1: 扩展类型**

在 `types.ts` 增加：

```ts
export type BriefSlot = "earnings" | "statement" | "minutes" | "sep";

export type BriefStatus =
  | "pending_material"
  | "queued"
  | "processing"
  | "ready"
  | "failed"
  | "failed_exhausted"
  | "not_applicable";

export type BriefSection = { id: string; heading: string; body: string };

export type BriefDoc = {
  eventId: string;
  slot: BriefSlot;
  status: BriefStatus;
  sections?: BriefSection[];
  generatedAt?: string;
  sourceUrls?: string[];
  disclaimer?: string;
  errorMessage?: string;
};

export type ProductBriefCardState =
  | { kind: "placeholder" }
  | { kind: "writing" }
  | { kind: "ready"; brief: BriefDoc }
  | { kind: "failed"; retrying: boolean; message?: string }
  | { kind: "not_applicable" }
  | { kind: "unavailable" }; // get-briefs 网络失败
```

- [x] **Step 2: 写状态合成单测**

覆盖设计 §4.1：

- 材料未发布 → placeholder（即使无 brief）
- 材料已发布 + 无 brief → writing
- ready / failed / failed_exhausted / not_applicable
- FOMC 必须补全 3 槽位；`hasSep` 从 `event.materials` 推导（held 且无 `sep` 条目 → `not_applicable`；勿假设类型上已有 `hasSep` 字段）

- [x] **Step 3: 跑测失败 → 实现 `briefs.ts` → 跑测通过**

导出：`slotsForEvent(kind)`、`resolveBriefCardState({ event, brief, materialPublished, hasSep })`、`mergeBriefCards(...)`。

Run: `pnpm exec vitest run src/features/event-track/briefs.test.ts`  
Expected: PASS

- [ ] **Step 4: Commit（仅当用户要求）**

---

### Task 3: CloudBase 建集合（需 env）

**Files:** none（控制台 / MCP）

**Blocked until:** 用户提供 `envId` 且 CloudBase MCP 可用。

- [x] **Step 1: 确认环境**

用 MCP `envQuery` / 控制台确认当前环境 ID。

- [x] **Step 2: 创建集合**

创建空集合（文档库不会因 `add` 自动建集合）：

- `briefs`（**必建**）
- `jobs`（**必建**）
- `pipeline_meta`（**必建** — 存 `lastDailyAt`；Task 7 idle/daily 依赖，**不可跳过**）
- （可选）`source_artifacts`

建议索引（控制台）：`briefs.eventId`；`jobs` 上 `status` + `nextRunAt`。

- [x] **Step 3: 安全规则**

- `briefs` / `jobs`：**仅云函数可写**；客户端默认拒绝写
- 读走 `get-briefs` HTTP，不强制开放文档库匿名读

- [x] **Step 4: 插入一条 fixture brief（手动）**

`_id`: 任选真实 `eventId__earnings`，`status: "ready"`，`sections` 使用设计 §4.4 id：`verdict`, `financials`, `yoy_qoq`, `segments`, `management`, `guidance`, `risks`。

- [x] **Step 5: 记录 envId 到本地 `.env.local`（勿提交）**

```bash
# .env.local — gitignored
VITE_CLOUDBASE_BRIEFS_URL=https://<稍后网关域名>/briefs
```

（`VITE_*` URL 待 Task 5 `get-briefs` 部署后填写）
---

### Task 4: 前端 AI 区（fixture / mock 可先跑）

**Files:**

- Create: `src/features/event-track/components/AiBriefPanel.tsx`
- Modify: `src/features/event-track/api.ts`
- Modify: `src/features/event-track/event-track.scss`
- Modify: `src/routes/events/$eventId.tsx`
- Modify: `.env.example`

- [x] **Step 1: `fetchBriefs`**
- [x] **Step 2: 实现 `AiBriefPanel`**
- [x] **Step 3: 详情页并入**
- [x] **Step 4: 样式**
- [x] **Step 5: 本地验证**
- [ ] **Step 6: Commit（仅当用户要求）**

---

### Task 5: HTTP Function `get-briefs`

**Files:**

- Create: `cloudfunctions/get-briefs/index.ts`
- Create: `cloudfunctions/get-briefs/package.json`
- Create: `cloudfunctions/get-briefs/scf_bootstrap`

参考技能：CloudBase `cloud-functions`（HTTP Function listen `9000` + CORS）。源码为 **TypeScript**，由构建链部署时编译。

- [x] **Step 1: 实现最小 HTTP 服务**
- [x] **Step 2: 部署**
- [x] **Step 3: 冒烟**
- [x] **Step 4: 前端 `.env.local` 填真实 URL，刷新详情页验证**
- [ ] **Step 5: Commit（仅当用户要求）**

---

### Task 6: `generate-brief`（先手动 job，再接 LLM）

**Files:**

- Create: `cloudfunctions/generate-brief/index.ts`
- Create: `cloudfunctions/generate-brief/package.json`
- Create: `cloudfunctions/generate-brief/prompts.ts` — earnings-trader-v1 / fomc-*-std-v1；earnings sections：`market_take`, `pnl_quality`, `bs_cf_check`, `notes_red_flags`, `kpi_marginal`, `mda_outlook`, `trade_lens`

- [x] **Step 1: 实现 claim + 状态机（可先 mock LLM）**

流程：

1. 领 `jobs`（queued 且 `nextRunAt <= now`）或指定 `jobId`
2. 锁过期的 `processing`（>15min）回 `queued`
3. claim → `processing`
4. **Phase A：** `sections` 用固定 mock 文本写 `briefs`=`ready`（验证链路）
5. job → `succeeded`

失败路径：attempts++，退避 `1m,5m,15m,1h,6h`；**可重试失败时**写 `briefs.status=failed` + `errorMessage`（UI：「解读生成失败，将自动重试」）；`attempts >= maxAttempts` 时写 `briefs.status=failed_exhausted`（UI：**不再**写「将自动重试」）。

- [x] **Step 2: 部署 Event Function；超时 180s**（默认内存 256MB；Phase B 再升 ≥512MB）

- [x] **Step 3: 手动插入一条 `jobs` 文档并 invoke**

Expected: 对应 `briefs` 变 `ready`。已验证：`earnings-MSFT-000119312526323660` mock brief `ready`（7 sections）。

- [x] **Step 4: Phase B — 换成真实抓取 + DeepSeek API**

- 财报：`data.sec.gov` 解析 `primaryDocument` → Archives 正文 HTML→纯文本（截断）
- FOMC：Fed URL → HTML 文本
- DeepSeek OpenAI 兼容：`https://api.deepseek.com` + `response_format: json_object`（见[官方 JSON Output](https://api-docs.deepseek.com/zh-cn/guides/json_mode)）
- 环境变量：`DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL`（默认 `deepseek-v4-flash`）写在云函数配置，**不进前端**
- 强制 JSON `sections[]`；解析失败 → failed + 重试
- 写入 `model`、`promptVersion`、`sourceFingerprint`、`generatedAt`
- 可选 `job.sourceText`：出口受限时预置原文

- [x] **Step 5: 用真实已披露 Mag7 filing 跑通 1 条**

Expected: 中文标准块齐全。已验证：`earnings-GOOGL-000165204426000071`，`model=deepseek-v4-flash`，7 sections ready。

- [ ] **Step 6: Commit（仅当用户要求）**

---

### Task 7: `detect-new-materials` + Timer

> **产品节奏澄清（相对「披露后立刻分析」）：**  
> Timer **每 30 分钟唤醒一次**，函数内部按窗口算 `dense` / `daily` / `idle`：
>
> - **dense**（临近披露/会议窗口内）：本轮扫相关材料，发现缺口则入队并 `callFunction('generate-brief')`
> - **daily**（无活跃窗口且距上次兜底 ≥约 7 天）：轻量全量补漏当前年；日程缓存同约 7 天
> - **idle**：几乎立刻空退出，**不**打 SEC/Fed  
>   因此不是「每一条披露事件立刻单独触发一次定时任务」，而是「定时醒来 → 窗口内尽快发现 → 入队生成」。窗口外靠 weekly daily 兜底。待披露 `earnings-pending-*` **永不**入队。历史年不自动扫。

**Files:**

- Create: `cloudfunctions/detect-new-materials/index.ts`
- Create: `cloudfunctions/detect-new-materials/package.json`
- 内嵌或同步 `detect-windows` 逻辑（与 `server/lib/detect-windows.ts` 行为一致）

- [x] **Step 1: 实现模式分支**

1. **默认移植**仓库 `server/lib/sec.ts`、`nasdaq.ts`、`fed.ts`、`constants.ts` 的逻辑进云函数（或共享打包），在函数内拉日程与材料链接；**不要**依赖本机 Vite middleware；时间线读路径走同环境 `get-events`，勿假设外部第三方托管 URL 在云函数内一定可达
2. 计算活跃窗口 → `resolveDetectMode`（与 `server/lib/detect-windows.ts` 行为一致）
3. `idle` → 立即 `{ earlyExit: true }`（新鲜 `pipeline_meta.scheduleByYear` 缓存命中时**不**打外部 HTTP）
4. `dense`/`daily`/`backfill` → 对比指纹；缺口入队；SEP 无则 `not_applicable`
5. **禁止**为 `earnings-pending-*` 建 job
6. 有入队 → `callFunction('generate-brief')`（同步等待可能超时；job 已入队，靠 Task 8 队列 Timer 或手动 invoke 消费）
7. `daily` 成功后写 `pipeline_meta` 文档（`_id: "detect"`）的 `lastDailyAt`

- [x] **Step 2: 单测/脚本验证窗口判断与现有 `server/lib/detect-windows` 一致**（`server/lib/detect-windows.cloudfn.test.ts`）

- [x] **Step 3: 部署 + Timer 每 30 分钟**（`detect-every-30m`：`0 */30 * * * * *`）

- [x] **Step 4: 强制 `mode: "daily"` 手动 invoke 一次**

Expected：对已披露且无 brief 的事件入队。已验证：`enqueued: 25`；随后手动 `generate-brief` 跑通 MSFT 10-K → `deepseek-v4-flash`。

- [x] **Step 5: 验证 idle 轮次**（`year:2019` 第二次：`earlyExit:true` + `fetchedExternal:false`）

- [ ] **Step 6: Commit（仅当用户要求）**

---

### Task 8: 队列 Timer + 历史年 backfill（含 HTTP 触发）

**Files:**

- Modify: `cloudfunctions/generate-brief/`（确认无 job 空退出）
- Create: `cloudfunctions/trigger-backfill/index.ts`
- Create: `cloudfunctions/trigger-backfill/package.json`
- Create: `cloudfunctions/trigger-backfill/scf_bootstrap`
- Modify: `src/features/event-track/api.ts` — `requestBriefBackfill(year)`
- Modify: `src/routes/index.tsx` — 年份 `<select>` / 切换时调用（详情页只读 `search.year`，backfill 挂在时间线切年）
- Modify: `.env.example` — 增加 `VITE_CLOUDBASE_BACKFILL_URL`、`VITE_BRIEF_API_KEY`（浏览器可见，仅单用户可接受）

- [x] **Step 1: 为 `generate-brief` 配稀有重试 Timer 1h**（现行 `generate-queue-1h`：`0 0 */1 * * * *`；无 job 空退出。主路径仍是 detect 入队后 invoke；勿再配 1min/12min 空转）

- [x] **Step 2: `detect-new-materials` 支持入参 `{ year, mode: "backfill" }`**（Task 7 已支持；忽略窗口、全年缺口入队）

- [x] **Step 3: 实现 HTTP `trigger-backfill`**

- Listen `9000` + 无手写 CORS
- `POST /` body: `{ "year": 2025 }`
- Header: `X-Brief-Api-Key` 与 `BRIEF_API_KEY` 比对，失败 401
- 成功则 `callFunction('detect-new-materials', { year, mode: 'backfill' })`
- URL：`https://…tcloudbaseapp.com/trigger-backfill`

前端：`requestBriefBackfill(year)`；时间线切年 fire-and-forget。

- [x] **Step 4: 冒烟** — 无 key → 401；带 key → `ok:true`，2025 `enqueued:24`，`generateInvoked:false`（交队列 Timer）

- [ ] **Step 5: Commit（仅当用户要求）**

---

### Task 9: 可选 `admin-requeue` + 文档收尾

**Files:**

- Create: `cloudfunctions/admin-requeue/index.ts`（可选）
- Modify: `README.md`

- [ ] **Step 1: admin-requeue** — 按 `eventId+slot` 忽略旧指纹强制新 job（无 UI）

- [ ] **Step 2: README 增加「AI 解读 / CloudBase」小节**

含：`envId`、集合名、三个函数、Timer、`.env.local`、免责声明。

- [ ] **Step 3: 全量 `pnpm test && pnpm build`**

- [ ] **Step 4: 对照 PRD §3.2 验收表手工勾选**

- [ ] **Step 5: Commit（仅当用户要求）**

---

## 验收清单（实现完成后）

| #   | 标准                                                            | Pass? |
| --- | --------------------------------------------------------------- | ----- |
| 1   | 已披露财报详情：三层可见；ready 时含标准 sections               |       |
| 2   | 刚披露无 brief：AI=撰写中；链接可用                             |       |
| 3   | 待披露：AI=占位，非撰写中                                       |       |
| 4   | FOMC 三卡独立；无 SEP=不适用；Minutes 未发=占位                 |       |
| 5   | 失败可见；耗尽后不再写「将自动重试」                            |       |
| 6   | 刷新不重复调 LLM（只读 briefs）                                 |       |
| 7   | idle 检测不打 SEC/Fed                                           |       |
| 8   | 同一 fingerprint 不重复入队                                     |       |
| 9   | 切换历史年后可触发 backfill，摘要最终可就绪（非永久「未发生」） |       |

---

## 风险与注意

- CloudBase HTTP Function 与 Event Function 代码形态不同，勿混用 `exports.main` / `listen(9000)`。
- 文档集合必须先创建。
- SEC 需合规 User-Agent；函数出站与超时要配够。
- `detect-windows` 双份代码（server + cloudfunctions）需注释同步，避免漂移。
- 长 PDF/10-K 可能超上下文：实现时截断/分块，prompt 注明「基于提供片段」。

---

## 修订记录

| 日期       | 变更                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------- |
| 2026-07-31 | 初稿：按 PRD + CloudBase 设计拆 Task 0–9                                                          |
| 2026-07-31 | 审阅修订：`pipeline_meta` 必建；补 `trigger-backfill` HTTP + 前端切年；detect 默认移植 server/lib |
| 2026-07-31 | 再审：失败写 `failed` 再耗尽；trigger-backfill 补齐 HTTP 文件；验收 #9；fixture section ids       |
| 2026-07-31 | 云函数统一 **TypeScript**（`.ts`）；删除 JS+CJS 默认；新增 CloudFunctions TS 约定                 |
| 2026-08-01 | 架构改为全栈 CloudBase：新增 `get-events`、静态托管前端；移除 Vite/Vercel 时间线部署假设          |
