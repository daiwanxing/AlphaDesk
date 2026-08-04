# A 股量能「量能状态与全天预测」设计

## 0. 范围分层

按交付复杂度拆成三期。**实现与验收以 MVP 为准**；后两期只保留契约与边界，不进入本期开发。

| 阶段          | 交付                                                                           | 不做什么                                                     |
| ------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| **MVP**       | 确定性 `turnoverInsight` + 量能状态面板 + 收盘 profile 落库 + 冷启动 bootstrap | 不做 LLM、不做买卖解读、不做量价位置叙事、不接付费历史分钟库 |
| **Phase 1.5** | 可选盘中解读（规则模板优先，LLM 可选）                                         | 不改变 MVP 计算口径；无认证时不开放匿名按需生成              |
| **Phase 2**   | 市场宽度、板块扩散、量价位置                                                   | 不与本期预测算法混写；需单独数据源与口径                     |

产品原则（各期通用）：

- 放量/缩量没有绝对数值，核心是相对参照基准的对比；
- MVP 只回答「今天量节奏偏不偏、全天大致多少」，**不**回答「该不该买」；
- 文案统一使用「历史节奏参考」，不使用「可信信号 / 交易信号」；
- LLM 若引入，只做解释层，不参与计算、状态判定或交易决策。

### 数据策略（拍板）

免费公开接口（东财 / 腾讯）**不能稳定提供近 20 日分钟成交额**，因此：

1. **自建 profile = 长期真源**：每个交易日收盘后写入完整分钟累计快照；样本变厚后用真实同刻中位数。
2. **bootstrap = 冷启动过渡**：用「近 20 日日 K 全天额（尺度）+ 短窗口分时进度形状」先让面板可用。
3. **不接 Tushare 等付费分钟库**（本期）；若日后要加速回填，单独立项。

---

## 1. 背景与目标

当前 A 股量能板块已经提供：

- 沪市、深市、北证的累计成交额
- 今日与上一交易日同一时刻的成交额对比
- 盘中累计成交额曲线
- 盘前、盘中、午休、收盘和休市状态

### MVP 目标

帮助交易员在开盘后快速判断：

1. 当前成交节奏相对近期典型节奏是否放量或缩量；
2. 按当前节奏全天成交额大致落在哪个区间；
3. 这个判断基于何种口径、多少样本；
4. 比较基准与有效数据时间始终可见；
5. **部署首日即可展示**（bootstrap），不因 profile 未攒满而整模块空白。

### 明确不做（MVP）

- 板块轮动、个股筛选、交易信号推荐；
- 结合股价位置的量价叙事（低位放量=启动等）；
- LLM 盘中摘要、按需解读入口、叙事缓存与定时生成；
- 把回测完成作为上线硬门槛（回测作为上线后校准，见 §3.4）；
- 付费历史分钟回填（Tushare 等）。

---

## 2. 产品形态（MVP）

在现有三张 KPI 卡与分时图之间增加紧凑的「量能状态」面板：

**成熟口径（profile ≥ 10）：**

```text
量能状态       温和缩量 · 历史节奏参考
预计全天成交额  12800–13600 亿
当前成交节奏    86% · 低于近 20 日同刻中位数
判断依据       截至 10:30 · 样本 18/20 日
```

**冷启动口径（bootstrap）：**

```text
量能状态       温和缩量 · 历史节奏参考
预计全天成交额  12800–13600 亿
当前成交节奏    86% · 低于近期典型同刻水平
判断依据       截至 10:30 · 形状 3 日 · 尺度 20 日日K · 样本较少
```

交互规则：

- 9:30 开盘初期显示「数据积累中」，不展示不稳定的预测；
- 9:45 后，在样本和当前数据质量达标时展示预测区间；
- 午休时冻结 11:30 快照，并标注「午盘快照」；
- 收盘后将预测状态切换为实际全天成交额；
- 预测展示区间而非过度精确的单点数字；
- 所有状态都必须同时展示比较基准、`effectiveTime`、口径方法与样本信息；
- bootstrap 必须可见「样本较少」，避免被理解成满样本 20 日同刻；
- 基础成交额可用但预测不可用时，只隐藏预测，不阻塞量能板块；
- **MVP 不提供「盘中解读」入口**；面板文案由确定性字段直接渲染。

状态文案：

- 生命周期 `status`：`warming_up` / `active` / `unavailable` / `final`
- 节奏 `paceState`（仅 `active`）：
  - `strongly_contracting`：明显缩量
  - `contracting`：温和缩量
  - `normal`：正常
  - `expanding`：温和放量
  - `strongly_expanding`：明显放量

说明：内部仍用五档，便于后续校准；若 UI 需要更短，可把温和/明显合并展示为「缩量 / 正常 / 放量」，但 DTO 保持五档。

与现有「上一交易日同刻对比」并存：

- 昨同刻：回答「比昨天多还是少」；
- 近期典型节奏：回答「是否偏离正常节奏」（bootstrap 或 profile，见 §3）。

---

## 3. 计算口径（MVP）

所有金额使用元作为内部单位，前端统一按亿元展示。

### 3.1 双模式总览

| 模式          | `baseline.method`             | 何时启用                   | 典型同刻水平                   |
| ------------- | ----------------------------- | -------------------------- | ------------------------------ |
| **bootstrap** | `kline_scale_short_shape_v1`  | `complete` profile &lt; 10 | `median(F_d) × median(r_s(t))` |
| **profile**   | `median_intraday_progress_v1` | `complete` profile ≥ 10    | `median(C_d(t))`（真实同刻）   |

目标窗口仍为近 20 个完整交易日；profile 达到 20 后为成熟态，文案可写「近 20 日」。

切换规则：

- 优先尝试 profile 模式；`complete` 且该分钟 `sampleDays ≥ 10` 时使用 profile；
- 否则若满足 bootstrap 门槛，使用 bootstrap，`status=active`；
- 两者都不满足 → `status=unavailable`；
- 一旦进入 profile 模式，**不再回退**到 bootstrap（除非 profile 被清理且再次不足）。

### 3.2 进度形状（两种模式共用）

对可用的形状样本日 `s`，时刻 `t`：

```text
r_s(t) = C_s(t) / F_s
```

- profile 模式：`s` 来自近 20 个 `complete` profile；
- bootstrap 模式：`s` 来自短窗口分时（已落库的 profile，含种子日；以及盘中可读的近几日 trends2 / 腾讯分时），**最少 2 个**有效形状日。

三市按分钟对齐后聚合；某市场缺该分钟则该日不进入该分钟样本。不插值。

```text
baselineProgress(t) = median(r_s(t))
```

全天预测（两种模式相同）：

```text
projectedFullDayAmount = C_today(t) / baselineProgress(t)
projectedLow  = C_today(t) / P75(r_s(t))
projectedHigh = C_today(t) / P25(r_s(t))
```

P25/P75：升序样本线性插值，位置 `p * (n - 1)`。分母为零或非有限 → 该时刻预测不可用。

### 3.3 节奏比例

**profile 模式（长期真源）：**

```text
paceRatio = C_today(t) / median(C_d(t))
```

`C_d(t)` 来自近 20 日（至少 10 日）complete profile 的真实同刻累计额。

**bootstrap 模式（冷启动）：**

```text
typicalSameTime = median(F_d) × baselineProgress(t)
paceRatio       = C_today(t) / typicalSameTime
```

- `F_d`：近 20 个交易日三市合计全天成交额，来自**日 K**（已有能力，立即可用）；至少 10 根有效日 K；
- `baselineProgress(t)`：短窗口形状中位数（§3.2）；
- 含义：用「近期典型全天规模 × 典型进度」近似同刻水平，再与今日累计比较。

两种模式共用同一套 `paceState` 阈值（§3.4）。

### 3.4 状态阈值

固定、可版本化：

- `paceRatio >= 1.10`：明显放量；
- `1.03 <= paceRatio < 1.10`：温和放量；
- `0.97 <= paceRatio < 1.03`：正常；
- `0.90 <= paceRatio < 0.97`：温和缩量；
- `paceRatio < 0.90`：明显缩量。

约束：

- 只作「历史节奏观察」分层，不是交易信号；
- UI 必须标注「历史节奏参考」；
- bootstrap 额外标注「样本较少」。

**回测（上线后校准，不挡 MVP）：**

- 积累足够 complete profile 后，对 profile 口径做滚动样本外回放；
- bootstrap 与 profile 可并行记录误差，用于决定是否提前/推迟切换阈值；
- 边界切换过频时再加滞回——不能用 LLM 平滑数值。

状态只在新的完整分钟点到达后更新。

### 3.5 样本与质量门槛

**bootstrap 启用条件（须同时满足）：**

- 有效形状日 `shapeDays ≥ 2`（该分钟有限正进度样本）；
- 有效日 K 尺度日 `scaleDays ≥ 10`；
- `median(F_d)`、`baselineProgress(t)`、`typicalSameTime` 均为有限正数。

**profile 启用条件：**

- 该分钟 `sampleDays ≥ 10` 的 complete profile；
- 目标展示窗口 20 日；profile 保留最近 60 个完整交易日以便补缺。

**profile 完整性（写入 `complete`）：**

- 09:30–11:30 与 13:00–15:00，共 242 个分钟点；
- 至少 230 个点有效（约 95%）；
- 任一交易时段连续缺点 ≤ 5；
- 累计成交额单调不减；
- 最后有效点不早于 14:55；
- 最后累计与全天成交额差异 ≤ 1%；
- 三市场均满足以上规则。

合成或比例缩放的市场 fallback → 可存 `degraded` 供诊断，**不得**进入 profile 模式样本；bootstrap 形状日若仅含 degraded，须在 `baseline` 中暴露，且优先使用含真实分钟额的沪/深日。

### 3.6 交易时段与有效分钟

- 盘中使用「已完成的最后一分钟」，例如 10:30 请求 → 不晚于 10:29 的最后有效点；
- 9:45 是最早允许生成预测的墙上时间，仍须满足有效分钟与样本；
- 午休有效分钟最多取 11:30；
- 收盘：三市均有全天额，且分钟最后有效点不早于 14:55；15:00 全天额以日 K/收盘为准；
- 上海时区；`asOf` 与 `effectiveTime` 必须分别返回。

---

## 4. 数据流与边界（MVP）

```text
第三方行情（东财 / 腾讯）
    ↓
云函数：今日分时 + 日 K（尺度）+ 短窗口分时（形状种子）
    ↓
CloudBase profile（收盘写入；部署时可种子近几日）
    ↓
应用层：profile 优先，否则 bootstrap
    ↓
turnoverInsight → 前端只展示
```

### 4.1 数据来源

- 东方财富：实时 / 近几日 `trends2`、日 K；
- 腾讯：沪深多日分时与日 K 兜底（北证无额字段，合计仍以东财为主）；
- CloudBase：自建 profile（长期真源）。

不引入付费分钟历史库。第三方请求只从云函数发起。

### 4.2 历史快照（自建 profile）

文档 ID：`turnover_profile_<YYYY-MM-DD>`，集合 `pipeline_meta`。至少包含：

```text
tradeDate
unit: yuan
timeZone: Asia/Shanghai
markets:
  sh/sz/bj:
    points: [{ t, v }]
    fullDayAmount
    source
total:
  points: [{ t, v }]
  fullDayAmount
quality:
  schemaVersion
  status: complete/degraded
  completeMarkets
  lastPoint
  validPointCount
  expectedPointCount
  source
generatedAt
```

`total` 必须由三市按分钟对齐聚合，不能直接用第三方已聚合展示值。

repository：

- `loadTurnoverProfile` / `saveTurnoverProfile`
- `listTurnoverProfiles` / `deleteTurnoverProfilesBefore`

**收盘任务（15:10，上海时区，持久化定时，非 fire-and-forget）：**

- 写入当日 profile（幂等）；
- 尽力补齐缺失交易日（受公开接口深度限制，通常只能补近几日）；
- 清理超过 60 个完整交易日的文档；
- 失败只影响未来口径升级，不影响基础量能 HTTP。

**部署种子（一次性 / 可重复幂等）：**

- 用东财 `trends2`（ndays=2|3，可试 5）+ 腾讯多日分时，把接口当前能给的近几日写成 profile；
- 日 K 拉取近 20+ 日全天额，供 bootstrap 尺度使用（尺度不必等 profile）；
- 不在盘中 15 秒轮询链路里做重回填。

### 4.3 公共响应（MVP）

```text
turnoverInsight:
  status
  paceState?
  reason?
  effectiveTime
  paceRatio?
  projectedFullDayAmount?
  projectedRange?: { low, high }
  actualFullDayAmount?
  baseline?:
    windowDays          # 目标窗口，通常 20
    sampleDays          # profile 模式：该分钟 complete 样本数
    shapeDays?          # bootstrap：形状日数
    scaleDays?          # bootstrap：日 K 尺度日数
    firstTradeDate?
    lastTradeDate?
    method              # kline_scale_short_shape_v1 | median_intraday_progress_v1
    quality             # bootstrap | active | mature
  asOf
```

`baseline.quality`：

- `bootstrap`：`method=kline_scale_short_shape_v1`
- `active`：profile 模式且 `10 ≤ sampleDays < 20`
- `mature`：profile 模式且 `sampleDays ≥ 20`（窗口内）

`status`：`warming_up` / `active` / `unavailable` / `final`（语义同前；bootstrap 成功时为 `active`）。

`reason`（`unavailable`）：`insufficient_shape_days`、`insufficient_scale_days`、
`insufficient_samples`、`invalid_profile`、`invalid_current_data`、`stale_profile` 等。
不再仅因「profile &lt; 10」而整模块不可用——应先尝试 bootstrap。

`paceState` 在 `active` 下必填；`final` 用 `actualFullDayAmount`。

**MVP 响应不含 narrative / LLM 字段。**

---

## 5. 失败与降级（MVP）

- 当前行情失败且有缓存：展示上一帧并标陈旧；
- 当前行情失败且无缓存：沿用现有量能错误态；
- profile 不足但 bootstrap 可用：展示 insight，`quality=bootstrap`；
- bootstrap 也不满足：基础量能正常，预测「暂不可用」+ 具体 `reason`；
- profile 损坏：不降级为把 degraded 当 complete；可回退 bootstrap（若门槛满足）；
- 今日累计须有限、非负、有效分钟内单调不减且 &gt; 0；
- 典型同刻水平须为有限正数，否则 `invalid_current_data`；
- 午休用 11:30；收盘转 `final`；MVP 不持久化预测误差审计。

---

## 6. 测试与验收（MVP）

### 纯逻辑测试

- profile 模式：预测点、P25/P75、五档阈值；
- bootstrap 模式：`typicalSameTime = median(F)×median(r)`，五档阈值；
- profile ≥ 10 时选用 profile，不再用 bootstrap；
- 形状 &lt; 2 或日 K &lt; 10 → unavailable 及对应 reason；
- 9:30 / 9:45 / 午休 / 收盘；
- 零分母、非有限值、缺失分钟；
- 当前等于典型同刻 → `normal`。

### 应用层测试

- 无 profile、有日 K + 短分时 → bootstrap `active`；
- 有 ≥ 10 complete profile → profile `active`；
- 种子写入幂等；收盘任务写入不影响 HTTP 成功路径；
- 第三方当前行情失败时缓存行为不变；
- 收盘 `final`。

### 前端测试

- bootstrap 与 profile 文案区分（样本较少 / 同刻中位数）；
- warming-up、不可用、午休、收盘；
- 展示亿元区间、`effectiveTime`、样本/形状/尺度信息；
- 含「历史节奏参考」，无买卖建议。

### MVP 验收标准

交易员在 10:00 左右无需查看原始曲线，即可回答：

1. 今天节奏相对近期典型是放量还是缩量；
2. 偏离大约多少；
3. 全天成交额大致区间；
4. 当前用的是 bootstrap 还是 profile，样本/形状/尺度各多少。

部署后**首个交易日**（在能拉到 ≥ 2 日形状 + ≥ 10 日日 K 的前提下）面板应可用，而不是空白等待 10 个收盘。

不验收：LLM、量价位置、板块轮动、付费分钟回填。

---

## 7. Phase 1.5：盘中解读（延后）

在 MVP 稳定、且具备应用认证代理（或明确仅服务端定时）后再做。

最小路径：规则模板（`paceState` + `baseline.quality`）。

完整路径：独立解读 HTTP + 可选 LLM；失败降级模板；不影响轮询。契约实现时再冻结。

---

## 8. Phase 2：量价与结构（延后）

- 上涨/下跌家数、板块扩散、排名进出、量价背离、轮动；
- 需单独数据源与算法，不与 MVP 预测混写。

可选后续：付费分钟库仅用于历史 profile 加速回填，不替代收盘自建真源。
