# AlphaDesk Terminal

> Category: Project Design System  
> Surface: desktop web / responsive web (投研终端壳)  
> Product: AlphaDesk Terminal · 事件追踪 / News 快讯 / A 股量能  
> Source: 投研终端骨架畅想 (`c9e4a6d4-f80c-41fd-868a-8d8b4ecbd3a3`) · 持续演进

面向专业投研场景的**高密度、冷静、数据优先**桌面终端界面系统。浅冷灰蓝画布、近黑前景、绿色 accent 作选中/状态点缀；阴影极少，靠 1px 边框与 inset accent 条表达层级与选中。数据看板页可采用更大内容卡圆角与 KPI 数字动效，与壳层控件区分。

---

## Context

### Source product

| Field              | Evidence                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| Product name in UI | **AlphaDesk Terminal** (`.brand-name`)                                                                     |
| Source project     | 投研终端骨架畅想 · `c9e4a6d4-f80c-41fd-868a-8d8b4ecbd3a3`                                                  |
| Primary surfaces   | 顶栏搜索壳、侧栏模块导航、News 快讯列表、事件追踪列表、右侧详情阅读面、A 股量能看板                        |
| Core capabilities  | 模块切换（news/events/turnover）、筛选 chip、列表选中驱动详情、结论条 + 指标表 + 时间线、量能 KPI + 分时图 |
| Audience           | 买方/卖方投研、宏观与个股事件跟进                                                                          |
| Platform           | Desktop-web first；断点 1100 / 820 收导航与单栏                                                            |
| Language           | 界面简体中文；ticker / FOMC / Live / Earnings 保留英文                                                     |
| Evidence files     | `research-terminal-shell.html`, `research-terminal-shell-2.html`（canonical tokens from v2 `:root`）       |
| Preserved examples | `examples/research-terminal-shell.html`, `examples/research-terminal-shell-2.html`                         |

### Product context (what users do)

1. 从侧栏进入 **事件追踪**、**News 快讯** 或 **A 股量能**
2. 用 filter chip 收窄类型（财报 / FOMC / 待发生 / 已披露 等）
3. 在中间栏扫时间与标签，点选一条
4. 右侧按 **结论 → 结构化事实 → 影响面 → 跟踪动作** 读完并收藏/加入跟踪
5. 量能页扫 KPI 与分时累计对比图（总成交额 / 昨日总成交额）

所有示意数据在源项目中明确为 demo；设计系统不发明「伪实时」行情精度。

---

## 1. Visual Theme & Atmosphere

**产品语境**：投研人员在一个三栏壳里扫快讯与高优先级事件（科技财报、FOMC），左侧导航、中间列表、右侧详情按「结论 → 结构化事实 → 影响面 → 跟踪动作」展开；量能等数据看板在 content-pane 内以卡片 + 图表面板呈现。

**气质**

- 机构级工具感，而非消费级仪表盘营销风
- 信息密度高但呼吸感来自 1px 分隔与 sticky 日分组；看板页可用独立内容卡增加留白
- 冷静冷色基底 + 单一绿 accent；**A 股涨跌用红涨绿跌**（`--market-up` / `--market-down`），与 success/danger 状态色分离
- 品牌名 **AlphaDesk** + 次级 **Terminal**（muted）；标记为深色方块内白色折线（资产见 `assets/brand-mark.svg`）

**系统一句话**：冷色浅底的高密度投研终端——绿 accent 只服务选中与 live，数字用系统字体 + tabular-nums，结构靠边框而非阴影。

---

## 2. Color

### Core tokens（必须写入 `:root`）

| Token       | Value                  | Role                              |
| ----------- | ---------------------- | --------------------------------- |
| `--bg`      | `oklch(98% 0.005 250)` | 页面底、hover 浅底、表格头        |
| `--surface` | `oklch(100% 0 0)`      | 顶栏、侧栏、列表、卡片面、说明条  |
| `--fg`      | `#121111`              | 主文案、主按钮填充（默认近黑）    |
| `--muted`   | `#999999`              | 次文、标签、meta（弱视觉）        |
| `--border`  | `#e0e0e0`              | 全站 1px 线、网格缝（默认中性灰） |
| `--accent`  | `oklch(58% 0.16 145)`  | 选中条、active 图标、focus 环     |

### Semantic

| Token       | Value                 | Use                                                     |
| ----------- | --------------------- | ------------------------------------------------------- |
| `--success` | `oklch(52% 0.14 150)` | 完成态 / beat / released / live 点（**不是** A 股涨色） |
| `--warn`    | `oklch(62% 0.14 75)`  | 中等影响、FOMC 类标签                                   |
| `--danger`  | `oklch(52% 0.18 25)`  | 错误 / miss / 高影响 / hawk（**不是** A 股跌色）        |
| `--info`    | `oklch(52% 0.12 250)` | 区域、待发生、dove                                      |

### A 股行情方向（与西方红绿相反）

| Token           | Value     | Use                                      |
| --------------- | --------- | ---------------------------------------- |
| `--market-up`   | `#e53935` | 涨、成交额较上日正增（大陆行情惯例红涨） |
| `--market-down` | `#2e7d32` | 跌、成交额较上日负增（绿跌）             |

状态色（success/danger）与行情色分离：标签「已披露」仍用 success 绿；量能/涨跌数字只用 `--market-up` / `--market-down`。

### 派生用法（勿另起品牌色）

- 选中列表项：`background: oklch(58% 0.16 145 / 0.07)` + `box-shadow: inset 2px 0 0 var(--accent)`
- Nav active：`background: oklch(58% 0.16 145 / 0.1)`，图标改 accent
- Filter on：`border oklch(80% 0.04 145)` + accent 8% 底
- Tag 变体：文字色 = 语义色；边框/底用同色 0.28–0.35 / 0.07–0.1 alpha
- Overlay：`oklch(22% 0.02 240 / 0.28)`
- Toast / 主按钮：`bg = --fg`，字 = `--surface`

**规则**：每屏 accent 点缀 ≤ 2 处结构性使用（选中条 + focus/live）；行情涨跌色只用于数值，不铺大面。

完整变量见 `colors_and_type.scss`。

---

## 3. Typography

| Role               | Stack / size                                              | Notes                                  |
| ------------------ | --------------------------------------------------------- | -------------------------------------- |
| Display / 详情标题 | `--font-display` · `clamp(20px, 2.2vw, 26px)` · 600–700   | 与 body 同族，靠字号/字距区分          |
| List title         | 15px · 600 · -0.015em                                     | 列表头                                 |
| Brand              | 13px · 600 · -0.01em                                      | 后缀 Terminal 用 muted 500             |
| Body / 行项目      | 13–14px · 510–550 · 1.4–1.5                               | 默认 `14px / 1.5` 文档根               |
| Section label      | 11px · 550 · uppercase · 0.08em                           | 侧栏组名、详情 h3、表头                |
| Tag                | 10px · 常规字重 · uppercase · 0.06em                      | 圆角同默认 4px                         |
| Meta / source      | 11–12px · muted / `#9ca3af`                               |                                        |
| 数据数字           | 继承 `--font-sans` · `font-variant-numeric: tabular-nums` | KPI、时间、badge；**不再使用 mono 栈** |

**字体栈（全站唯一）**

```css
--font-sans:
  -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans",
  sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
--font-display: var(--font-sans);
--font-body: var(--font-sans);
```

不再维护 `--font-mono` / JetBrains Mono。数字对齐靠 `tabular-nums`，不靠等宽字体。不引入展示性衬线或装饰字体。

---

## 4. Spacing

| Token | px                  | 典型用途            |
| ----- | ------------------- | ------------------- |
| 2–4   | gap 紧凑标签        | tags、chip 间距     |
| 6–8   | 控件内、metric 区   | filter gap、toolbar |
| 10–14 | 列表项/卡片 padding | news/event 12–14    |
| 16–24 | 详情内边距、看板卡  | detail-inner、KPI   |
| 48    | 顶栏高度 / 空状态   |                     |

**半径**

| Token            | Value   | 用途                                     |
| ---------------- | ------- | ---------------------------------------- |
| `--radius`       | `4px`   | 控件、标签、nav chip、brand-mark、小控件 |
| `--radius-panel` | `16px`  | 内容大卡：KPI 卡、图表面板、说明条等     |
| `--radius-pill`  | `999px` | 仅 pill / live 等                        |
| `--radius-full`  | `50%`   | 头像、状态点                             |

**边框色**：默认一律 `var(--border)` = `#e0e0e0`；语义态可偏离。  
**阴影**：仅下拉/移动抽屉 `0 8px 24px oklch(22% 0.02 240 / 0.12)`；live 点外环；**默认卡片无大阴影**（看板卡可用极轻 hover，非必须）。

详见 `tokens.scss`。

---

## 5. Layout & Composition

### 壳结构（三栏）

```
┌──────── topbar 48px ─────────────────────────────┐
│ brand(nav-w) │ search ≤420 │ live · notify · avatar │
├─────┬──────────────┬─────────────────────────────┤
│ nav │ list-pane    │ detail / content-pane       │
│ 220 │ 340–420      │ 事件详情或全宽看板           │
└─────┴──────────────┴─────────────────────────────┘
```

- `app`：`grid-template-rows: top-h 1fr`，`min-height: 100dvh`
- `workspace`：`grid-template-columns: nav-w list-w 1fr`（看板页可仅用 content-pane 全宽）
- 列表与详情滚动各自 `min-height: 0; overflow: auto`
- 详情内容节奏固定：**结论条 → 区块 h3（uppercase）→ 表/列表/网格 → 相关**

### 数据看板（量能等）

- 顶栏：标题 + 短副文案；右上会话徽章 + 数据时间
- KPI：独立 `--surface` 卡，`--radius-panel`，横向 gap，**不**用 1px 拼缝网格
- 图表面板：同半径大卡；图例优先用图表库自带 legend；主序列冷蓝面积渐变 + 对比橙折线
- 说明条：量能页对比说明并入副标题 / 图注，勿再叠一层 disclaimer 卡
- 看板表面（KPI / 图表面板）：`--surface` + 1px `--border` + `--radius-panel`
- 看板容器 **不**设人为 `max-width`，跟随 content-pane 宽度

### 响应式

| 断点    | 行为                                                      |
| ------- | --------------------------------------------------------- |
| ≤1100px | 导航收为 56px 图标轨；brand 名隐藏                        |
| ≤820px  | 单栏；nav 抽屉 + backdrop；list/detail 互斥显示；返回列表 |

### 密度

- 导航项高 36px；chip/按钮高 28px；图标钮 32px
- 列表行双行标题 clamp；sticky 日分组 `day-group`
- 网格缝：`gap: 1px; background: var(--border)` 模拟分割（rate-decision、impact-grid、read-grid）

---

## 6. Components

| 组件          | 类名/形态                | 要点                                   |
| ------------- | ------------------------ | -------------------------------------- |
| Brand mark    | `.brand-mark`            | 22×22 · r3 · fg 底 + 白折线 SVG        |
| Search        | `.search`                | 高 32 · bg 底 · kbd                    |
| Live pill     | `.live-pill`             | pill · success 点 + 光晕               |
| Icon button   | `.icon-btn`              | 32 · hover bg                          |
| Avatar        | `.avatar`                | 28 圆 · 字标                           |
| Nav item      | `.nav-item`              | 36 · active soft accent · badge        |
| Filter chip   | `.filter-chip`           | pill · `.is-on` 绿边                   |
| News item     | `.news-item`             | 52px 时间列 + 正文 · 选中 inset accent |
| Event card    | `.event-card`            | ticker + metric-row · 选中同左         |
| Tags          | `.tag` + 语义修饰        | impact / region / beat / miss / hawk…  |
| Primary btn   | `.primary-btn`           | fg 实心 · 字 surface · 高 28           |
| Ghost btn     | `.ghost-btn`             | 边框 surface · `.is-on` 同 filter      |
| Conclusion    | `.conclusion`            | 状态条卡片                             |
| Metric table  | `.metric-table`          | 表头 uppercase · `.num` tabular-nums   |
| Rate decision | `.rate-decision`         | 1px 缝双格                             |
| Timeline      | `.timeline-item`         | done=success 点 · now=accent           |
| Impact grid   | `.impact-grid`           | 2 列缝格                               |
| Check list    | `.check-list`            | accent-color 深绿                      |
| Note box      | `.note-box`              | textarea + foot                        |
| Toast         | `.toast`                 | 底中 · fg 底 · `.is-show`              |
| KPI 卡        | `.turnover-kpi__card` 等 | `--radius-panel` · NumberFlow 动效     |
| 图表面板      | `.turnover-panel`        | `--radius-panel` · ECharts legend      |

可复用片段与应用壳见 `ui_kits/app/`；源实现见 `examples/`。

---

## 7. Motion & Interaction

- 列表 hover/选中：`transition: background 0.12s ease`
- Toast / nav 抽屉：`0.2s` opacity + transform
- Focus：`:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }`
- 主按钮 hover：`opacity: 0.9`（不用亮色填充跳动）
- 禁用 nav：`opacity: 0.45; cursor: not-allowed` +「待建」角标
- **KPI 数字**：使用 [`@number-flow/react`](https://number-flow.barvian.me/) 做数值位滚动过渡；尊重 `prefers-reduced-motion`（库默认 `respectMotionPreference`）
- **图表入场**：ECharts 默认 clip 展开；避免父级反复 `setOption` / 首帧 `resize` 打断动画
- 尊重 `prefers-reduced-motion`：新实现中关闭非必要位移动画，保留状态切换

交互模型：模块切换、筛选 chip、列表选中驱动详情、移动端 list↔detail、toast 短反馈、量能盘中轮询刷新。

---

## 8. Voice & Brand

- **语言**：界面默认简体中文；专有名词保留英文（FOMC、News、Live、Terminal、ticker 代码）
- **语气**：短句、业务向、无营销口号；空状态说明下一步操作
- **术语**：快讯 / 事件追踪 / 结论 / 影响面 / 跟踪动作 / 待建 / 已披露 / 待发生 / 量能 / 分时累计
- **大小写**：section 标签全大写英文 tracking；正文中文不强制 Title Case
- **数字**：tabular-nums、可比较；涨跌附 `up`/`down` 色，不单靠箭头 emoji；量能统一「亿」+ 三位分节（如 `25,598亿`）

示例文案风格：「高优先级时效事件 · 科技财报 + FOMC · 点选看右侧完整详情」

---

## 9. Anti-patterns

1. **紫粉渐变 / 全屏洗色** — 与冷灰终端气质冲突
2. **控件大圆角 + 左色条装饰** — 控件仍 4px；选中只用 2px inset accent（内容大卡 16px 除外）
3. **Emoji 当功能图标** — 使用 1.7 stroke 线性 SVG
4. **展示性字体**（Fraunces 等）或把 Inter 当「品牌展示」堆字重花活
5. **伪造实时行情精度** — 示意数据需可辨；新指标勿装作成交真相
6. **阴影堆叠 elevation 系统** — 默认靠 border；阴影仅抽屉/下拉
7. **暖米色默认画布** — 必须冷蓝灰 `--bg`
8. **accent 大面积铺底** — accent 是点缀不是主题色块
9. **单独引入等宽 mono 字体栈** — 已弃用；数字用系统字体 + tabular-nums
10. **消费级插画人物/手绘风景** — 本系统无插画层
11. **看板说明条用灰底** — 量能对比说明进副标题/图注，勿再单独 disclaimer 卡；看板表面用 `--surface`

---

## Package map

| Path                    | Role                      |
| ----------------------- | ------------------------- |
| `colors_and_type.scss`  | 色与字体 token + 工具类   |
| `tokens.scss`           | 间距 / 半径 / 阴影 / 布局 |
| `preview/`              | 分项审查卡                |
| `ui_kits/app/`          | 应用界面 kit              |
| `examples/`             | 完整源 shell 保留         |
| `assets/`               | brand-mark 等矢量         |
| `context/provenance.md` | 溯源                      |

生成新产物时：粘贴 `colors_and_type.scss`（及需要时 `tokens.scss`）到首个 `<style>`，按本文件组件表与 `ui_kits/app` 对齐结构。
