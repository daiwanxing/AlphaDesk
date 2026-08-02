# A-share Turnover Intraday Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/turnover` 从三市卡片改成「沪深京合计」分时累计对比图（今蓝面积 + 昨橙线），经现有 `get-market-turnover` 返回分钟序列；盘中 15s 刷新，缺昨日分时可降级。

**Architecture:** 云函数并行拉三市东财 `trends2`，分钟额 cumsum 后按 `HH:mm` 对齐求和；昨日全日序列写 `pipeline_meta` 文档 `_id: "turnover_intraday_prev"`。前端用 ECharts 按需 ESM 画交易时段 ordinal 轴；KPI 跟 `compareMode` / `session` 文案走规格 §3.1。

**Tech Stack:** 现有 React 19 + TanStack Router + Vitest；云函数 TypeScript；新增 `echarts`（`echarts/core` 按需）。

**Spec:** `docs/superpowers/specs/2026-08-02-a-share-turnover-intraday-chart-design.md`  
**Predecessor:** `docs/superpowers/specs/2026-08-02-a-share-market-turnover-design.md`（入口/轮询/会话仍有效；O(1) 上游约束本版放宽）

**Locked choices:**

- 图表：**ECharts** 按需，不做 uPlot / 手写 SVG 主路径
- 对比：默认 `vs_prev_same_time`；缺对比分时 → `vs_prev_full_day`
- 首屏：KPI + 合计图；三市卡降级（可不展示或折叠，第一版可隐藏）
- `deltaPct` 分母：同时刻用 `prevSameTimeAmount`；降级用 `prevFullDayAmount`
- `pre_open`：与 `weekend` 相同映射（主=上一交易日全日，对比=再上一交易日）
- Commits：仅当用户明确要求时执行计划中的 Commit 步骤

---

## File map

| Path                                                                | Responsibility                                                          |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `cloudfunctions/get-market-turnover/series.ts`                      | 纯函数：parse trends 行、cumsum、三市对齐求和、同时刻取值、选主/对比日  |
| `cloudfunctions/get-market-turnover/series.test.ts`                 | 上述纯函数 Vitest（fixture，无实网）                                    |
| `cloudfunctions/get-market-turnover/eastmoney.ts`                   | 新增 `fetchTrends2(secId, ndays)` + host failover                       |
| `cloudfunctions/get-market-turnover/index.ts`                       | 组装 `series` / `compareMode` / 扩展 `total`；读写 intraday 缓存        |
| `src/features/market-turnover/types.ts`                             | `CompareMode`、`TurnoverPoint`、`series`、`prevSameTimeAmount`          |
| `src/features/market-turnover/cache.ts`                             | `turnoverDataEqual` 纳入 `series` 末点 / `compareMode`                  |
| `src/features/market-turnover/trading-axis.ts`                      | 交易分钟 ordinal 轴标签（09:30–11:30 \| 13:00–15:00）                   |
| `src/features/market-turnover/trading-axis.test.ts`                 | 轴长度与午休拼接单测                                                    |
| `src/features/market-turnover/kpi-labels.ts`                        | 按 `session` 返回 KPI 文案                                              |
| `src/shared/charts/echarts.ts`                                      | `echarts/core` + LineChart / Grid / Tooltip / CanvasRenderer `use` 一次 |
| `src/features/market-turnover/components/IntradayTurnoverChart.tsx` | ECharts 双线面积图封装                                                  |
| `src/features/market-turnover/components/TurnoverBoard.tsx`         | KPI + 图替换三卡主视觉                                                  |
| `src/features/market-turnover/market-turnover.scss`                 | KPI / 图容器样式（token）                                               |
| `package.json`                                                      | 加 `echarts` 依赖                                                       |

---

### Task 1: 分时序列纯函数（TDD）

**Files:**

- Create: `cloudfunctions/get-market-turnover/series.ts`
- Create: `cloudfunctions/get-market-turnover/series.test.ts`

- [ ] **Step 1: 写失败单测**

覆盖：

1. `parseTrendsLine`：一行 CSV → `{ day, t, amount }`
2. 单市分钟额 cumsum
3. 三市按 `t` 对齐求和（**锁定：只输出三市都有该 `t` 的点**）
4. `valueAtOrBefore(points, t)`：精确命中；缺 `10:01` 时取 `10:00`
5. `pickSeriesDates(session, todayYmd, availableDaysSortedAsc)`：
   - `continuous` / `lunch` / `closed` → tradeDate=todayYmd（若 today 不在列表则用最大可得日），prev=严格更早的最大日
   - `weekend` / `pre_open` → tradeDate=最大可得日，prev=再上一可得日

```ts
import {
  cumsumMinuteAmounts,
  mergeMarketCumulatives,
  parseTrendsLine,
  pickSeriesDates,
  valueAtOrBefore,
} from "./series";

it("pickSeriesDates weekend uses latest two days", () => {
  expect(pickSeriesDates("weekend", "2026-08-02", ["2026-07-30", "2026-07-31"])).toEqual({
    tradeDate: "2026-07-31",
    prevTradeDate: "2026-07-30",
  });
});
```

- [ ] **Step 2: 跑测确认失败**

Run: `pnpm exec vitest run cloudfunctions/get-market-turnover/series.test.ts`  
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `series.ts`**

导出至少：

```ts
export type MinuteAmount = { t: string; amount: number };
export type TurnoverPoint = { t: string; v: number };

export function parseTrendsLine(line: string): { day: string; t: string; amount: number } | null;
export function cumsumMinuteAmounts(minutes: MinuteAmount[]): TurnoverPoint[];
export function mergeMarketCumulatives(markets: TurnoverPoint[][]): TurnoverPoint[];
export function valueAtOrBefore(points: TurnoverPoint[], t: string): number | undefined;
export function pickSeriesDates(
  session: "pre_open" | "continuous" | "lunch" | "closed" | "weekend",
  todayYmd: string,
  availableDaysSortedAsc: string[],
): { tradeDate: string; prevTradeDate: string };
export function calcDelta(amount: number, baseline: number): { delta: number; deltaPct: number };
```

`calcDelta`：`deltaPct = baseline > 0 ? delta / baseline : 0`（与现 `index.ts` 一致，可抽到 series 复用）。

- [ ] **Step 4: 跑测通过**

Run: `pnpm exec vitest run cloudfunctions/get-market-turnover/series.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**（仅当用户要求）

```bash
git add cloudfunctions/get-market-turnover/series.ts cloudfunctions/get-market-turnover/series.test.ts
git commit -m "feat(turnover): add intraday series pure helpers"
```

---

### Task 2: 东财 `trends2` 客户端

**Files:**

- Modify: `cloudfunctions/get-market-turnover/eastmoney.ts`
- Optional fixture: `cloudfunctions/get-market-turnover/fixtures/trends-sh-sample.json`（截断 5–10 行即可，供本地手工）

- [ ] **Step 1: 实现 `fetchTrends2(secId: string, ndays: 1 | 2): Promise<string[]>`**

- Hosts 顺序：`push2delay` → `push2` → `push2his`（与现有 ulist/kline 风格一致）
- URL：`/api/qt/stock/trends2/get?secid=...&fields1=f1,...,f13&fields2=f51,...,f58&iscr=0&ndays=...&ut=...`
- 返回 `data.trends` 字符串数组；全失败抛错
- **不要**在单测里打实网

- [ ] **Step 2: 本地烟测（手动，可选）**

优先用 Task 1 fixture；若要实网，在已能跑通的环境执行（仓库未必有 `tsx`）：临时 `console.log` 于本地调用，或 `pnpm cf:build` 后对编译产物试拉。Expected：`trends` 长度 ≥ 241。

若 `ndays=2` 只返回一日：仍算成功，由 Task 3 缓存补昨日。

- [ ] **Step 3: Commit**（仅当用户要求）

---

### Task 3: 云函数组装响应 + 昨日分时缓存

**Files:**

- Modify: `cloudfunctions/get-market-turnover/index.ts`

- [ ] **Step 1: 扩展类型与缓存文档**

```ts
type IntradayPrevDoc = {
  _id: "turnover_intraday_prev";
  prevTradeDate: string;
  points: { t: string; v: number }[];
  updatedAt: string;
};
```

读/写独立于现有 `_id: "turnover"` 日 K 缓存。

- [ ] **Step 2: 在 `buildResponse` 中拉 trends 并填 `series`**

逻辑顺序：

1. **盘中/收盘主路径：用 `trends2` 取代 `fetchRealtimeAmounts`（ulist）** 作为 `markets[].amount` / `total.amount` 来源；日 K / `turnover` meta 仍只服务 `prevFullDayAmount` 与快照兜底。不要 trends2 + ulist 双打。
2. `Promise.all(MARKETS.map(m => fetchTrends2(m.secId, 2)))`（**锁定：任一市失败则 throw**）
3. 解析 → 按日 cumsum → `mergeMarketCumulatives`
4. `pickSeriesDates(session, todayYmd, availableDays)` 填 `series.today` / `series.prev`
5. 若 `series.prev` 空：读 `turnover_intraday_prev`；命中且日期匹配则用缓存点
6. 若仍空：`compareMode = "vs_prev_full_day"`，`prev = []`，`prevSameTimeAmount = prevFullDayAmount`
7. 否则：`compareMode = "vs_prev_same_time"`，`prevSameTimeAmount = valueAtOrBefore(prev, lastToday.t) ?? prevFullDayAmount`
8. `total.amount = last(series.today).v`；`delta`/`deltaPct` 按 mode 选 baseline（`calcDelta`）
9. `markets[]`：各市主日 cumsum 终点 + 既有 prevFullDay（日 K）
10. 若本次解析出完整对比日合计序列，写回 `turnover_intraday_prev`
11. `disclaimer` 区分同时刻 / 降级

**快照模式（weekend / pre_open）：** 主序列用 `pickSeriesDates` 选出的交易日全日 trends；KPI 文案禁止「今日」。

- [ ] **Step 3: `pnpm cf:typecheck`**

Expected: PASS

- [ ] **Step 4: Commit**（仅当用户要求）

---

### Task 4: 前端类型与缓存相等性

**Files:**

- Modify: `src/features/market-turnover/types.ts`
- Modify: `src/features/market-turnover/cache.ts`
- Modify: `src/features/market-turnover/cache.test.ts`

- [ ] **Step 1: 更新类型**

```ts
export type CompareMode = "vs_prev_same_time" | "vs_prev_full_day";

export type TurnoverPoint = { t: string; v: number };

export type MarketTurnoverTotal = {
  amount: number;
  prevFullDayAmount: number;
  prevSameTimeAmount: number;
  delta: number;
  deltaPct: number;
};

export type MarketTurnoverResponse = {
  // ...existing
  compareMode: CompareMode;
  total: MarketTurnoverTotal;
  series: {
    tradeDate: string;
    prevTradeDate: string;
    today: TurnoverPoint[];
    prev: TurnoverPoint[];
  };
};
```

- [ ] **Step 2: 扩展 `turnoverDataEqual`**

除现有字段外比较：`compareMode`、`total.prevSameTimeAmount`、`series.today.at(-1)`、`series.prev.at(-1)`（避免整列 deep equal 过重）。

- [ ] **Step 3: 更新 `cache.test.ts` fixture 与断言**

Run: `pnpm exec vitest run src/features/market-turnover/cache.test.ts`  
Expected: PASS

- [ ] **Step 4: Commit**（仅当用户要求）

---

### Task 5: 交易时段轴 + KPI 文案（TDD）

**Files:**

- Create: `src/features/market-turnover/trading-axis.ts`
- Create: `src/features/market-turnover/trading-axis.test.ts`
- Create: `src/features/market-turnover/kpi-labels.ts`
- Create: `src/features/market-turnover/kpi-labels.test.ts`

- [ ] **Step 1: `buildTradingMinuteLabels(): string[]`**

生成 `09:30`…`11:30` 然后 `13:00`…`15:00`（含端点；1 分钟步长）。长度应为 241（与东财一致：上午 121 + 下午 120，或按实测锁定——**以与 fixture 对齐为准，写进测试常量**）。

- [ ] **Step 2: `alignSeriesToAxis(axis: string[], points: TurnoverPoint[]): (number | null)[]`**

按轴输出 `v`，缺分钟用 `null`（ECharts 断点）或向前填充——**锁定：缺分钟为 `null`，线自然断，避免错误插值**。主序列盘中未走到的未来分钟保持 `null`。

- [ ] **Step 3: `kpiLabels(session)`**

返回 `{ primary, secondary, delta }` 文案；`weekend` / `pre_open` 禁用「今日」。

- [ ] **Step 4: 跑测**

Run: `pnpm exec vitest run src/features/market-turnover/trading-axis.test.ts src/features/market-turnover/kpi-labels.test.ts`  
Expected: PASS

---

### Task 6: 安装 ECharts + 共享入口

**Files:**

- Modify: `package.json` / lockfile
- Create: `src/shared/charts/echarts.ts`

- [ ] **Step 1: 安装**

```bash
pnpm add echarts
```

- [ ] **Step 2: 按需注册**

```ts
// src/shared/charts/echarts.ts
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent, MarkLineComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([LineChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer]);

export { echarts };
export type { EChartsOption } from "echarts";
```

`MarkLineComponent` 用于 11:30|13:00 分割线（可选）。

- [ ] **Step 3: Commit**（仅当用户要求）

---

### Task 7: `IntradayTurnoverChart` 组件

**Files:**

- Create: `src/features/market-turnover/components/IntradayTurnoverChart.tsx`
- Modify: `src/features/market-turnover/market-turnover.scss`

- [ ] **Step 1: 实现组件**

Props：

```ts
type Props = {
  today: TurnoverPoint[];
  prev: TurnoverPoint[];
  primaryLabel: string; // 图例
  prevLabel: string;
  showPrev: boolean; // compareMode === vs_prev_same_time && prev.length > 0
};
```

行为：

- `useRef` + `echarts.init`；`ResizeObserver` 调 `resize`
- `setOption` 更新（`notMerge` 慎用；优先 merge 系列 data）
- X：`buildTradingMinuteLabels()` category
- Y：累计额；`axisLabel` formatter 用现有 `formatAmountYuan` 或缩写亿
- Series0：今日，`areaStyle` 浅蓝透明，线 `#3b6ea8` 或 CSS 变量读入（canvas 需实色，可在 scss 定义 `--chart-today` / `--chart-prev`）
- Series1：昨日，橙线，无 area；`showPrev` 为 false 时不加入或 data 全 null
- `animationDuration: 400` 左右；刷新勿 `dispose` 重建
- 高度：桌面 ~320px，窄屏 ~240px（scss）

- [ ] **Step 2: 卸载时 `chart.dispose()`**

---

### Task 8: 改造 `TurnoverBoard`

**Files:**

- Modify: `src/features/market-turnover/components/TurnoverBoard.tsx`
- Modify: `src/features/market-turnover/market-turnover.scss`
- Modify: `src/test/home.test.tsx`（若断言旧文案）

- [ ] **Step 1: 布局改为规格 §4.1**

- 标题 + session 徽章（保留）
- disclaimer 一行
- KPI 三格：主额 / 对比全日额 / delta（`formatDelta`；颜色仍 `delta--up/down`）
- `IntradayTurnoverChart`
- asOf
- **第一版隐藏**三市 `turnover-grid`（或 `<details>` 折叠，默认关）

- [ ] **Step 2: 降级提示**

`compareMode === "vs_prev_full_day"` 时 note 或 disclaimer 已含说明；图只画主序列。

- [ ] **Step 3: 跑相关测试**

```bash
pnpm exec vitest run src/features/market-turnover src/test/home.test.tsx
pnpm exec tsc -p tsconfig.app.json --noEmit
```

Expected: PASS

- [ ] **Step 4: Commit**（仅当用户要求）

---

### Task 9: 部署与手验清单

**Files:** 无必须改动（网关仍 `get-market-turnover`）

- [ ] **Step 1: `pnpm cf:build` + 部署该 HTTP 函数**（按仓库现有 `deploy:cloudbase` / 文档）

- [ ] **Step 2: 手验**

| 场景                     | 期望                                              |
| ------------------------ | ------------------------------------------------- |
| 盘中                     | 蓝面积爬升 + 橙线；KPI 较昨日为同时刻差；15s 更新 |
| 缺昨日分时（清缓存模拟） | 单蓝线 + 降级 disclaimer；KPI 相对昨收全天        |
| 周末                     | 徽章周末；KPI 无「今日」；主=上交易日             |
| 窄屏                     | KPI 堆叠，图可读                                  |

- [ ] **Step 3: 更新规格状态行**（可选）为「已实现 / 待手验」

---

## 明确不做（本计划）

- 预测全天、近 60 日、增减分时柱
- Tooltip 精细交互（可随后加，非阻断）
- 浏览器直连东财
- Timer 落分钟库

---

## 执行说明

实现时按 Task 1→9 顺序；每 Task 内先红后绿。云函数与前端可在 Task 3 完成后并行 Task 4–8（若两人），单人建议串行。
