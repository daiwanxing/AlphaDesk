# Turnover Insight MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有量能看板上交付确定性「量能状态 + 全天区间」：自建 profile 为长期真源，冷启动用日 K 尺度 × 短窗口形状 bootstrap，首日即可用。

**Architecture:** 纯函数在 `domain/turnover-insight.ts` 算 `paceRatio` / 区间 / 状态；`pipeline_meta` 存每日 `turnover_profile_<date>`；`get-market-turnover` 组装可选 `turnoverInsight`（失败不挡基础响应）；新 event 函数 `refresh-turnover-profiles` 收盘写入 + 种子；前端在 KPI 与分时图之间渲染面板。

**Tech Stack:** 现有 TypeScript 云函数 + Vitest；`@contracts/market-turnover`；React 看板；CloudBase `pipeline_meta`；东财/腾讯（不接 Tushare）。

**Spec:** `docs/superpowers/specs/2026-08-03-turnover-insight-design.md`

**Locked choices:**

- MVP 不含 LLM / 解读入口
- `baseline.method`: `kline_scale_short_shape_v1` | `median_intraday_progress_v1`
- profile ≥10 同刻样本后切 profile，不回退 bootstrap（除非再次不足）
- Commits：仅当用户明确要求时执行计划中的 Commit 步骤

---

## File map

| Path                                                                   | Responsibility                                                |
| ---------------------------------------------------------------------- | ------------------------------------------------------------- |
| `packages/contracts/market-turnover.ts`                                | 新增 `TurnoverInsight` 及相关枚举                             |
| `packages/contracts/market-turnover.test.ts`                           | 契约形状冒烟                                                  |
| `cloudfunctions/get-market-turnover/domain/turnover-insight.ts`        | 中位数/分位、paceState、effectiveTime、bootstrap/profile 计算 |
| `cloudfunctions/get-market-turnover/domain/turnover-insight.test.ts`   | 纯逻辑单测                                                    |
| `cloudfunctions/get-market-turnover/domain/turnover-profile.ts`        | profile 完整性校验、三市对齐聚合                              |
| `cloudfunctions/get-market-turnover/domain/turnover-profile.test.ts`   | complete/degraded 规则                                        |
| `cloudfunctions/get-market-turnover/infrastructure/repository.ts`      | profile CRUD + list/delete                                    |
| `cloudfunctions/get-market-turnover/infrastructure/repository.test.ts` | 仓储单测                                                      |
| `cloudfunctions/get-market-turnover/application/service.ts`            | 组装 insight；异常吞掉保基础响应                              |
| `cloudfunctions/get-market-turnover/application/service.test.ts`       | bootstrap / profile / 隔离失败                                |
| `cloudfunctions/refresh-turnover-profiles/`                            | 收盘维护 + 种子 event 函数                                    |
| `cloudfunctions/functions.json`                                        | 注册 event                                                    |
| `scripts/cloudfunctions-manifest.test.ts`                              | 清单断言                                                      |
| `src/features/market-turnover/insight-labels.ts`                       | 状态/依据文案                                                 |
| `src/features/market-turnover/format.ts`                               | 区间亿元格式化                                                |
| `src/features/market-turnover/components/TurnoverInsightPanel.tsx`     | 面板 UI                                                       |
| `src/features/market-turnover/components/TurnoverBoard.tsx`            | 插入面板                                                      |
| `src/features/market-turnover/market-turnover.scss`                    | 面板样式                                                      |
| `src/features/market-turnover/cache.ts`                                | equality 纳入 insight                                         |
| 对应 `__tests__` / `components/__tests__`                              | 前端单测                                                      |

---

### Task 1: 公共契约 `TurnoverInsight`

**Files:**

- Modify: `packages/contracts/market-turnover.ts`
- Modify: `packages/contracts/market-turnover.test.ts`

- [ ] **Step 1: 扩展类型**

在 `packages/contracts/market-turnover.ts` 追加：

```ts
export type TurnoverInsightStatus = "warming_up" | "active" | "unavailable" | "final";

export type TurnoverPaceState =
  "strongly_contracting" | "contracting" | "normal" | "expanding" | "strongly_expanding";

export type TurnoverInsightReason =
  | "insufficient_shape_days"
  | "insufficient_scale_days"
  | "insufficient_samples"
  | "invalid_profile"
  | "invalid_current_data"
  | "stale_profile"
  | "profile_missing";

export type TurnoverBaselineMethod = "kline_scale_short_shape_v1" | "median_intraday_progress_v1";

export type TurnoverBaselineQuality = "bootstrap" | "active" | "mature";

export type TurnoverInsightBaseline = {
  windowDays: number;
  sampleDays: number;
  shapeDays?: number;
  scaleDays?: number;
  firstTradeDate?: string;
  lastTradeDate?: string;
  method: TurnoverBaselineMethod;
  quality: TurnoverBaselineQuality;
};

export type TurnoverInsight = {
  status: TurnoverInsightStatus;
  paceState?: TurnoverPaceState;
  reason?: TurnoverInsightReason;
  effectiveTime: string;
  paceRatio?: number;
  projectedFullDayAmount?: number;
  projectedRange?: { low: number; high: number };
  actualFullDayAmount?: number;
  baseline?: TurnoverInsightBaseline;
  asOf: string;
};
```

并在 `MarketTurnoverResponse` 增加可选字段：

```ts
turnoverInsight?: TurnoverInsight;
```

- [ ] **Step 2: 更新契约测试**

在 `market-turnover.test.ts` 增加一个带 `turnoverInsight` 的 `satisfies MarketTurnoverResponse` fixture（`status: "active"` + `paceState` + `baseline`），以及一个仅 `warming_up` / `unavailable` 的最小形状。

- [ ] **Step 3: 跑测试**

Run: `pnpm exec vitest run packages/contracts/market-turnover.test.ts`

Expected: PASS

- [ ] **Step 4: Commit**（仅用户要求时）

```bash
git add packages/contracts/market-turnover.ts packages/contracts/market-turnover.test.ts
git commit -m "$(cat <<'EOF'
feat(market-turnover): 契约增加可选 turnoverInsight

EOF
)"
```

---

### Task 2: 洞察纯函数（TDD）

**Files:**

- Create: `cloudfunctions/get-market-turnover/domain/turnover-insight.ts`
- Create: `cloudfunctions/get-market-turnover/domain/turnover-insight.test.ts`

- [ ] **Step 1: 写失败单测**

覆盖规格 §3：

1. `median([1,2,3]) === 2`；偶数个取中间两均值或文档约定（锁定：**升序后偶数取中间两数平均**）
2. `percentileLinear(sorted, 0.25/0.75)` 位置 `p*(n-1)` 线性插值
3. `paceStateFromRatio`：边界 0.90 / 0.97 / 1.03 / 1.10
4. `resolveEffectiveMinute({ session, wallClockHHmm, lastPointT })`：
   - continuous 10:30 → 不晚于 10:29 的最后点
   - lunch → 最多 11:30
   - 墙钟 &lt; 09:45 → warming_up（由上层用 status）
5. profile 模式：`paceRatio = C / median(C_d)`；投影与 P25/P75 区间
6. bootstrap：`typical = median(F) * median(r)`；`paceRatio = C / typical`；且断言 `status==="active"` **并且** `baseline.quality==="bootstrap"`、`method==="kline_scale_short_shape_v1"`（禁止写成 `quality:"active"`）
7. profile `sampleDays≥10` 时选用 profile，不走 bootstrap；`quality` 为 `active`（10–19）或 `mature`（≥20）
8. shapeDays&lt;2 → `insufficient_shape_days`；scaleDays&lt;10 → `insufficient_scale_days`
9. 分母 0 / 非有限 → `invalid_current_data`
10. C 等于 typical → `normal`

输入类型建议：

```ts
export type InsightDaySeries = {
  tradeDate: string;
  points: { t: string; v: number }[]; // 累计额
  fullDayAmount: number;
};

export type ComputeInsightInput = {
  session: MarketSession;
  asOf: string;
  wallClockHHmm: string; // 上海 HH:mm
  todayPoints: { t: string; v: number }[];
  todayFullDayAmount?: number; // closed/final
  completeProfiles: InsightDaySeries[]; // 仅 complete
  shapeDays: InsightDaySeries[]; // bootstrap 形状（可含短窗口）
  scaleFullDayAmounts: number[]; // 近 20 日 K 合计
  now: Date;
};
```

导出：`computeTurnoverInsight(input): TurnoverInsight`

- [ ] **Step 2: 跑测确认失败**

Run: `pnpm exec vitest run cloudfunctions/get-market-turnover/domain/turnover-insight.test.ts`

Expected: FAIL（模块不存在）

- [ ] **Step 3: 最小实现**

实现 `median`、`percentileLinear`、`paceStateFromRatio`、`resolveEffectiveMinute`、`computeTurnoverInsight`。常量：

```ts
const WINDOW_DAYS = 20;
const PROFILE_MIN_SAMPLES = 10;
const SHAPE_MIN_DAYS = 2;
const SCALE_MIN_DAYS = 10;
const EARLIEST_PREDICT_HHMM = "09:45";
```

切换逻辑严格按规格 §3.1。`final`：session=`closed` 且有 `todayFullDayAmount` 且最后点 ≥ 14:55 时输出 `actualFullDayAmount`，不填 projected。

- [ ] **Step 4: 跑测通过**

Run: `pnpm exec vitest run cloudfunctions/get-market-turnover/domain/turnover-insight.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**（仅用户要求时）

```bash
git add cloudfunctions/get-market-turnover/domain/turnover-insight.ts \
  cloudfunctions/get-market-turnover/domain/turnover-insight.test.ts
git commit -m "$(cat <<'EOF'
feat(market-turnover): 实现量能洞察 bootstrap/profile 纯计算

EOF
)"
```

---

### Task 3: Profile 校验与聚合（TDD）

**Files:**

- Create: `cloudfunctions/get-market-turnover/domain/turnover-profile.ts`
- Create: `cloudfunctions/get-market-turnover/domain/turnover-profile.test.ts`

- [ ] **Step 1: 写失败单测**

1. 期望交易分钟集合长度 242（09:30–11:30 ∪ 13:00–15:00，含端点按现有 `trading-axis` / 云函数惯例对齐——**与前端轴同一生成函数或复制常量到 domain，避免漂移**）
2. 三市 points + fullDay → `total` 按 t 对齐求和（缺一市该分钟则该分钟不进 total）
3. complete：valid≥230、无连续缺点&gt;5、单调不减、last≥14:55、|last-fullDay|/fullDay≤1%、三市均 complete
4. fallback/比例缩放标记 → `degraded`，不得当 complete

- [ ] **Step 2: 实现 `buildTurnoverProfile(...)` / `assessProfileQuality(...)`**

返回与规格 §4.2 对齐的内部结构（含 `docType: "turnover_profile"`、`schemaVersion: 1`）。

- [ ] **Step 3: 跑测**

Run: `pnpm exec vitest run cloudfunctions/get-market-turnover/domain/turnover-profile.test.ts`

Expected: PASS

- [ ] **Step 4: Commit**（仅用户要求时）

---

### Task 4: Repository profile CRUD

**Files:**

- Modify: `cloudfunctions/get-market-turnover/infrastructure/repository.ts`
- Modify: `cloudfunctions/get-market-turnover/infrastructure/repository.test.ts`

- [ ] **Step 1: 扩展 `TurnoverDatabase` 与 `TurnoverRepository`**

```ts
loadTurnoverProfile(tradeDate: string): Promise<TurnoverProfileDoc | null>;
saveTurnoverProfile(profile: TurnoverProfileDoc): Promise<void>;
listTurnoverProfiles(limit: number): Promise<TurnoverProfileDoc[]>;
deleteTurnoverProfilesBefore(tradeDate: string): Promise<number>;
```

文档 `_id = turnover_profile_${tradeDate}`。`list` 使用：

```ts
db.collection("pipeline_meta")
  .where({ docType: "turnover_profile" })
  .orderBy("tradeDate", "desc")
  .limit(limit)
  .get();
```

**部署注意：** CloudBase 控制台需为 `pipeline_meta` 建 `docType` + `tradeDate` 复合索引，否则 list 会运行时报错。在 Task 6 README/注释与手验清单写明。

（若测试用 mock DB 尚无 `where`，扩展 mock 接口。）`deleteTurnoverProfilesBefore`：list 后过滤 `tradeDate < cutoff` 逐条删除；单测用内存 mock。

- [ ] **Step 2: 单测覆盖 load miss / save 幂等 / list 排序 / delete 计数**

- [ ] **Step 3: 跑测**

Run: `pnpm exec vitest run cloudfunctions/get-market-turnover/infrastructure/repository.test.ts`

Expected: PASS

- [ ] **Step 4: Commit**（仅用户要求时）

---

### Task 5: 接入 `get-market-turnover` 应用服务

**Files:**

- Modify: `cloudfunctions/get-market-turnover/application/service.ts`
- Modify: `cloudfunctions/get-market-turnover/application/service.test.ts`

- [ ] **Step 1: 写应用层失败用例**

1. repository 返回 ≥10 complete profiles → `status:"active"`，`method=median_intraday_progress_v1`，`quality=active|mature`
2. **空库冷启动**：无 profile，但有 ≥10 日 K 合计 + ≥2 个**不含今日**的形状日 → `status:"active"`，`baseline.quality:"bootstrap"`，`method:"kline_scale_short_shape_v1"`（不得把 quality 写成 `active`）
3. `computeTurnoverInsight` 抛错或 repository list 失败 → 响应仍 `ok: true` 且无 insight 或 `unavailable`，**基础 markets/series 完整**
4. session continuous、墙钟 09:40 → `warming_up`
5. closed + 全日额 → `final`

**空库 bootstrap 形状配方（锁定，避免 continuous `ndays=2` 只有「今+昨」导致 shape&lt;2）：**

1. 为 insight 组装单独拉数（可与主图并行，失败不影响主响应）：三市 `fetchTrends2(secId, 3)`；若有效历史交易日仍 &lt;2，再对沪/深 `fetchTencentDayMinuteSeries` 合并多日累计（北证按现有合计口径用日 K 终点比例缩放，标记 degraded 形状时优先用含真实额的沪深日）。
2. 从解析结果中取出**严格早于今日**的交易日序列；每个形状日 `F_s` 来自三市日 K 对齐合计（与尺度同源）；缺 `F_s` 的日期不进 shapeDays。
3. 目标：至少 2 个形状日。若仍不足 → `unavailable` + `insufficient_shape_days`（诚实失败，不强造）。
4. 主图 KPI/分时仍可继续用现有 `ndays=2|3` 会话策略；**不要**为了 insight 把主路径改到每次强制 ndays=3 若会拖垮现有行为——insight 侧独立请求即可。

尺度：三市 `fetchDailyKlines(secId, 25)` 按日对齐求和得到 `F_d` 数组（缺一市的日期跳过）；`scaleDays≥10`。

已有 profile 时：形状/同刻样本优先 `listTurnoverProfiles(60)` 的 complete；不足再叠加本次短窗口历史日。

- [ ] **Step 2: 在 `buildResponse` 成功路径末尾附加**

```ts
try {
  response.turnoverInsight = computeTurnoverInsight(...);
} catch (err) {
  reportError(..., "turnoverInsight", err);
  // 不抛；可省略字段或写 unavailable
}
```

**禁止**因 insight 失败导致整接口 500。

- [ ] **Step 3: 跑测**

Run: `pnpm exec vitest run cloudfunctions/get-market-turnover/application/service.test.ts`

Expected: PASS

- [ ] **Step 4: Commit**（仅用户要求时）

---

### Task 6: 收盘维护 event 函数

**Files:**

- Create: `cloudfunctions/refresh-turnover-profiles/index.ts`
- Create: `cloudfunctions/refresh-turnover-profiles/package.json`（对齐其它 event：依赖 `@cloudbase/node-sdk`）
- Create: `cloudfunctions/refresh-turnover-profiles/maintain.ts`（可测的纯编排：拉数 → buildProfile → save → prune）
- Create: `cloudfunctions/refresh-turnover-profiles/maintain.test.ts`
- Modify: `cloudfunctions/functions.json` — `"event"` 数组加入 `"refresh-turnover-profiles"`
- Modify: `scripts/cloudfunctions-manifest.test.ts`

- [ ] **Step 1: 实现维护编排**

入口行为：

1. 用 provider 拉「可得到的」近几日三市分钟 + 对应日 K 全天额
2. `buildTurnoverProfile` → `saveTurnoverProfile`（幂等）
3. `listTurnoverProfiles(80)`，若 complete 数 &gt; 60，删除最旧（`deleteTurnoverProfilesBefore`）
4. 支持 event payload `{ mode?: "seed" | "daily" }`：seed 与 daily 同逻辑（尽力写近几日）；不在 HTTP 轮询里调用

复用 `get-market-turnover` 的 eastmoney/tencent/domain（相对 import 或在 maintain 内调用已导出函数）。若跨函数目录 import 不便，把 profile build 留在 `get-market-turnover/domain`，maintain 通过编译后的相对路径引用——**与仓库现有 cf:build 打包方式一致**；必要时把共享 domain 抽到两边都能 import 的路径。优先：**maintain 复制依赖注入调用 `buildTurnoverProfile`，构建脚本已打进各函数则改为在 get-market-turnover 内 export 并由 refresh 函数在构建时 bundle**。查 `scripts/build-cloudfunctions.mjs`：若每函数独立打包，则将 `turnover-profile.ts` / `turnover-insight.ts` 放在 refresh 函数可相对引用处，或在 refresh 内再 export 一份 thin re-export。

最简可构建方案（锁定）：把 profile 校验模块放在  
`cloudfunctions/get-market-turnover/domain/turnover-profile.ts`，  
`refresh-turnover-profiles` 通过  
`../get-market-turnover/domain/turnover-profile` 相对引用；确认 esbuild 入口能追到该文件。

- [ ] **Step 2: 单测 maintain（mock provider + repo）**

- [ ] **Step 3: 更新 manifest 测试**

- [ ] **Step 4: 跑测**

Run:

```bash
pnpm exec vitest run cloudfunctions/refresh-turnover-profiles scripts/cloudfunctions-manifest.test.ts
pnpm cf:typecheck
```

Expected: PASS

- [ ] **Step 5: 文档注释**

在 `refresh-turnover-profiles/index.ts` 顶部注明：需在 CloudBase 控制台配置定时触发 **工作日 15:10 Asia/Shanghai**（或等价 cron）；部署脚本不自动创建触发器则 README 补一句人工步骤。

- [ ] **Step 6: Commit**（仅用户要求时）

---

### Task 7: 前端文案与区间格式化

**Files:**

- Create: `src/features/market-turnover/insight-labels.ts`
- Create: `src/features/market-turnover/__tests__/insight-labels.test.ts`
- Modify: `src/features/market-turnover/format.ts`
- Modify: `src/features/market-turnover/__tests__/format.test.ts`

- [ ] **Step 1: `formatProjectedRangeYi(low, high)`**

内部元 → 亿。**锁定：** 两端各自走现有 `formatAmountYuan`（含千分位），再拼 en-dash，例如 `12,800–13,600亿`（去掉重复的第二个「亿」前缀只保留区间末一个「亿」，或两端都带「亿」二选一——实现时选 **`12,800亿–13,600亿`** 最不易歧义）。规格示意数字无逗号，产品以现有 KPI 格式为准。

- [ ] **Step 2: `insightPanelCopy(insight)`**

返回：

- `paceLabel`：明显缩量 / …
- `badge`：历史节奏参考
- `paceHint`：仅当 `baseline.quality==="bootstrap"` →「低于/高于近期典型同刻水平」；profile（active|mature）→「低于/高于近 N 日同刻中位数」
- `paceRatioText`：`paceRatio` 格式化为百分比整数或一位小数，如 `86%`（`Math.round(paceRatio * 100)`）
- `basis`：含 `effectiveTime`、sample/shape/scale；**仅 bootstrap** 附加「样本较少」
- `warming` / `unavailable` / `final` 专用文案

- [ ] **Step 3: 跑测**

Run: `pnpm exec vitest run src/features/market-turnover/__tests__/insight-labels.test.ts src/features/market-turnover/__tests__/format.test.ts`

Expected: PASS

---

### Task 8: 洞察面板 UI

**Files:**

- Create: `src/features/market-turnover/components/TurnoverInsightPanel.tsx`
- Create: `src/features/market-turnover/components/__tests__/TurnoverInsightPanel.test.tsx`
- Modify: `src/features/market-turnover/components/TurnoverBoard.tsx`
- Modify: `src/features/market-turnover/components/__tests__/TurnoverBoard.test.tsx`
- Modify: `src/features/market-turnover/market-turnover.scss`

- [ ] **Step 1: 实现面板**

插在 KPI `</dl>` 与分时图 `<section className="turnover-panel">` **之间**。

无 `turnoverInsight`：不渲染（旧缓存兼容）。

有 insight：

- `warming_up`：只显示「数据积累中」+ effectiveTime
- `unavailable`：预测暂不可用 + reason 人话
- `active`：四行（状态、预计区间、节奏、判断依据）
- `final`：全天实际成交额
- lunch：若服务已冻 11:30，可加「午盘快照」小标签（有则显示）

样式：紧凑，复用 `%turnover-surface` / 现有 token，不要新卡片堆砌；一行标签 + 数值用 `num`。

- [ ] **Step 2: Board 测试**

fixture 带/不带 insight；确认 DOM 文案。

- [ ] **Step 3: 跑测**

Run: `pnpm exec vitest run src/features/market-turnover/components/__tests__`

Expected: PASS

---

### Task 9: 缓存 equality 纳入 insight

**Files:**

- Modify: `src/features/market-turnover/cache.ts`
- Modify: `src/features/market-turnover/__tests__/cache.test.ts`

- [ ] **Step 1: `turnoverDataEqual` 比较 insight 关键字段**

至少：`status`、`paceState`、`effectiveTime`、`paceRatio`、`projectedRange`、`actualFullDayAmount`、`baseline.method/quality/sampleDays/shapeDays/scaleDays`、`reason`。  
基础成交额不变但 insight 变 → equal 为 false（规格验收）。

- [ ] **Step 2: 跑测**

Run: `pnpm exec vitest run src/features/market-turnover/__tests__/cache.test.ts`

Expected: PASS

---

### Task 10: 端到端回归与手验清单

- [x] **Step 1: 全量相关测试**

```bash
pnpm exec vitest run packages/contracts/market-turnover.test.ts \
  cloudfunctions/get-market-turnover \
  cloudfunctions/refresh-turnover-profiles \
  src/features/market-turnover \
  scripts/cloudfunctions-manifest.test.ts
```

Result (2026-08-04): **146 tests passed** across 21 files. (`cf:typecheck` 仍有既有 `@cloudbase/node-sdk` 解析问题，非本功能引入。)

- [ ] **Step 2: 手验清单（部署后）** — 待人工

1. 空库 + 日 K 正常：盘中 09:45 后出现 bootstrap「样本较少」
2. 手动触发 `refresh-turnover-profiles` seed：写入近几日 profile
3. insight 失败不影响 KPI/分时图
4. 旧前端缓存无 insight 字段仍正常
5. CloudBase：`pipeline_meta` 上 `docType` + `tradeDate` 复合索引已建，list 不报错
6. 控制台配置工作日 15:10 Asia/Shanghai 定时

- [ ] **Step 3: Commit**（仅用户要求时）

---

## Out of scope（本计划不做）

- LLM / `interpret-market-turnover`
- Tushare 回填
- 量价位置 / 板块轮动
- 预测误差审计持久化
- 回测流水线自动化
