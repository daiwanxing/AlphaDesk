# AlphaDesk Terminal

> Category: Project Design System  
> Surface: desktop web / responsive web (投研终端壳)  
> Product: AlphaDesk Terminal · 事件追踪 / News 快讯  
> Source: 投研终端骨架畅想 (`c9e4a6d4-f80c-41fd-868a-8d8b4ecbd3a3`)

面向专业投研场景的**高密度、冷静、数据优先**桌面终端界面系统。浅冷灰蓝画布、近黑前景、绿色 accent 作选中/状态点缀；数字与时间一律等宽 mono；圆角克制（4px）、阴影极少，靠 1px 边框与 inset accent 条表达层级与选中。

---

## Context

### Source product

| Field              | Evidence                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| Product name in UI | **AlphaDesk Terminal** (`.brand-name`)                                                                        |
| Source project     | 投研终端骨架畅想 · `c9e4a6d4-f80c-41fd-868a-8d8b4ecbd3a3`                                                     |
| Primary surfaces   | 顶栏搜索壳、侧栏模块导航、News 快讯列表、事件追踪列表、右侧详情阅读面                                         |
| Core capabilities  | 模块切换（news/events）、筛选 chip、列表选中驱动详情、结论条 + 指标表 + 时间线/影响网格、跟踪/收藏 toast 反馈 |
| Audience           | 买方/卖方投研、宏观与个股事件跟进                                                                             |
| Platform           | Desktop-web first；断点 1100 / 820 收导航与单栏                                                               |
| Language           | 界面简体中文；ticker / FOMC / Live / Earnings 保留英文                                                        |
| Evidence files     | `research-terminal-shell.html`, `research-terminal-shell-2.html`（canonical tokens from v2 `:root`）          |
| Preserved examples | `examples/research-terminal-shell.html`, `examples/research-terminal-shell-2.html`                            |

### Product context (what users do)

1. 从侧栏进入 **事件追踪** 或 **News 快讯**
2. 用 filter chip 收窄类型（财报 / FOMC / 待发生 / 已披露 等）
3. 在中间栏扫时间与标签，点选一条
4. 右侧按 **结论 → 结构化事实 → 影响面 → 跟踪动作** 读完并收藏/加入跟踪

所有示意数据在源项目中明确为 demo；设计系统不发明「伪实时」行情精度。

---

## 1. Visual Theme & Atmosphere

**产品语境**：投研人员在一个三栏壳里扫快讯与高优先级事件（科技财报、FOMC），左侧导航、中间列表、右侧详情按「结论 → 结构化事实 → 影响面 → 跟踪动作」展开。

**气质**

- 机构级工具感，而非消费级仪表盘营销风
- 信息密度高但呼吸感来自 1px 分隔与 sticky 日分组，而非大留白 hero
- 冷静冷色基底 + 单一绿 accent；涨跌用 success/danger，不靠彩虹色板
- 品牌名 **AlphaDesk** + 次级 **Terminal**（muted）；标记为深色方块内白色折线（资产见 `assets/brand-mark.svg`）

**系统一句话**：冷色浅底的高密度投研终端——绿 accent 只服务选中与 live，数字走 mono，结构靠边框而非阴影。

---

## 2. Color

### Core tokens（必须写入 `:root`）

| Token       | Value                  | Role                          |
| ----------- | ---------------------- | ----------------------------- |
| `--bg`      | `oklch(98% 0.005 250)` | 页面底、hover 浅底、表格头    |
| `--surface` | `oklch(100% 0 0)`      | 顶栏、侧栏、列表、卡片面      |
| `--fg`      | `oklch(22% 0.02 240)`  | 主文案、主按钮填充            |
| `--muted`   | `oklch(50% 0.018 240)` | 次文、标签、meta              |
| `--border`  | `oklch(90% 0.008 240)` | 全站 1px 线、网格缝           |
| `--accent`  | `oklch(58% 0.16 145)`  | 选中条、active 图标、focus 环 |

### Semantic

| Token       | Value                 | Use                            |
| ----------- | --------------------- | ------------------------------ |
| `--success` | `oklch(52% 0.14 150)` | 涨 / beat / released / live 点 |
| `--warn`    | `oklch(62% 0.14 75)`  | 中等影响、FOMC 类标签          |
| `--danger`  | `oklch(52% 0.18 25)`  | 跌 / miss / 高影响 / hawk      |
| `--info`    | `oklch(52% 0.12 250)` | 区域、待发生、dove             |

### 派生用法（勿另起品牌色）

- 选中列表项：`background: oklch(58% 0.16 145 / 0.07)` + `box-shadow: inset 2px 0 0 var(--accent)`
- Nav active：`background: oklch(58% 0.16 145 / 0.1)`，图标改 accent
- Filter on：`border oklch(80% 0.04 145)` + accent 8% 底
- Tag 变体：文字色 = 语义色；边框/底用同色 0.28–0.35 / 0.07–0.1 alpha
- Overlay：`oklch(22% 0.02 240 / 0.28)`
- Toast / 主按钮：`bg = --fg`，字 = `--surface`

**规则**：每屏 accent 点缀 ≤ 2 处结构性使用（选中条 + focus/live）；涨跌色只用于数值与标签，不铺大面。

完整变量见 `colors_and_type.scss`。

---

## 3. Typography

| Role               | Stack / size                                                  | Notes                                |
| ------------------ | ------------------------------------------------------------- | ------------------------------------ |
| Display / 详情标题 | `--font-display` · `clamp(20px, 2.2vw, 26px)` · 600 · -0.02em | 与 body 同族，靠字号/字距区分        |
| List title         | 15px · 600 · -0.015em                                         | 列表头                               |
| Brand              | 13px · 600 · -0.01em                                          | 后缀 Terminal 用 muted 500           |
| Body / 行项目      | 13–14px · 510–550 · 1.4–1.5                                   | 默认 `14px / 1.5` 文档根             |
| Section label      | 11px · 550 · uppercase · 0.08em                               | 侧栏组名、详情 h3、表头              |
| Tag                | 10px · 550 · uppercase · 0.06em                               | 小圆角 2px                           |
| Meta / source      | 11–12px · muted                                               |                                      |
| Mono 数据          | `--font-mono` · tabular-nums                                  | 时间、代码、badge 计数、metric、利率 |

**字体栈**

```css
--font-display: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", system-ui, sans-serif;
--font-body: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", system-ui, sans-serif;
--font-mono: "JetBrains Mono", "IBM Plex Mono", ui-monospace, Menlo, monospace;
```

不引入展示性衬线或装饰字体。中文跟随系统 UI 字体。

---

## 4. Spacing

| Token | px                  | 典型用途            |
| ----- | ------------------- | ------------------- |
| 2–4   | gap 紧凑标签        | tags、chip 间距     |
| 6–8   | 控件内、metric 区   | filter gap、toolbar |
| 10–14 | 列表项/卡片 padding | news/event 12–14    |
| 16–24 | 详情内边距          | detail-inner 24×32  |
| 48    | 顶栏高度 / 空状态   |                     |

**半径**：标签 2px · mark/kbd 3px · 控件/卡片 4px · pill/avatar 999 / 50%。  
**阴影**：仅下拉/移动抽屉 `0 8px 24px oklch(22% 0.02 240 / 0.12)`；live 点外环；**默认卡片无大阴影**。

详见 `tokens.scss`。

---

## 5. Layout & Composition

### 壳结构（三栏）

```
┌──────── topbar 48px ─────────────────────────────┐
│ brand(nav-w) │ search ≤420 │ live · notify · avatar │
├─────┬──────────────┬─────────────────────────────┤
│ nav │ list-pane    │ detail-pane (bg)            │
│ 220 │ 340–420      │ max-content 720 centered    │
└─────┴──────────────┴─────────────────────────────┘
```

- `app`：`grid-template-rows: top-h 1fr`，`min-height: 100dvh`
- `workspace`：`grid-template-columns: nav-w list-w 1fr`
- 列表与详情滚动各自 `min-height: 0; overflow: auto`
- 详情内容节奏固定：**结论条 → 区块 h3（uppercase）→ 表/列表/网格 → 相关**

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

| 组件          | 类名/形态         | 要点                                   |
| ------------- | ----------------- | -------------------------------------- |
| Brand mark    | `.brand-mark`     | 22×22 · r3 · fg 底 + 白折线 SVG        |
| Search        | `.search`         | 高 32 · bg 底 · kbd mono               |
| Live pill     | `.live-pill`      | pill · success 点 + 光晕               |
| Icon button   | `.icon-btn`       | 32 · hover bg                          |
| Avatar        | `.avatar`         | 28 圆 · 字标                           |
| Nav item      | `.nav-item`       | 36 · active soft accent · badge mono   |
| Filter chip   | `.filter-chip`    | pill · `.is-on` 绿边                   |
| News item     | `.news-item`      | 52px 时间列 + 正文 · 选中 inset accent |
| Event card    | `.event-card`     | ticker + metric-row · 选中同左         |
| Tags          | `.tag` + 语义修饰 | impact / region / beat / miss / hawk…  |
| Primary btn   | `.primary-btn`    | fg 实心 · 字 surface · 高 28           |
| Ghost btn     | `.ghost-btn`      | 边框 surface · `.is-on` 同 filter      |
| Conclusion    | `.conclusion`     | 状态条卡片                             |
| Metric table  | `.metric-table`   | 表头 uppercase · `.num` mono           |
| Rate decision | `.rate-decision`  | 1px 缝双格                             |
| Timeline      | `.timeline-item`  | done=success 点 · now=accent           |
| Impact grid   | `.impact-grid`    | 2 列缝格                               |
| Check list    | `.check-list`     | accent-color 深绿                      |
| Note box      | `.note-box`       | textarea + foot                        |
| Toast         | `.toast`          | 底中 · fg 底 · `.is-show`              |

可复用片段与应用壳见 `ui_kits/app/`；源实现见 `examples/`。

---

## 7. Motion & Interaction

- 列表 hover/选中：`transition: background 0.12s ease`
- Toast / nav 抽屉：`0.2s` opacity + transform
- Focus：`:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }`
- 主按钮 hover：`opacity: 0.9`（不用亮色填充跳动）
- 禁用 nav：`opacity: 0.45; cursor: not-allowed` +「待建」角标
- 尊重 `prefers-reduced-motion`：新实现中关闭非必要位移动画，保留状态切换

交互模型：模块切换（news/events）、筛选 chip 互斥/组合、列表选中驱动详情、移动端 list↔detail、toast 短反馈（收藏/通知示意）。

---

## 8. Voice & Brand

- **语言**：界面默认简体中文；专有名词保留英文（FOMC、News、Live、Terminal、ticker 代码）
- **语气**：短句、业务向、无营销口号；空状态说明下一步操作
- **术语**：快讯 / 事件追踪 / 结论 / 影响面 / 跟踪动作 / 待建 / 已披露 / 待发生
- **大小写**：section 标签全大写英文 tracking；正文中文不强制 Title Case
- **数字**：等宽、可比较；涨跌附 `up`/`down` 色，不单靠箭头 emoji

示例文案风格：「高优先级时效事件 · 科技财报 + FOMC · 点选看右侧完整详情」

---

## 9. Anti-patterns

1. **紫粉渐变 / 全屏洗色** — 与冷灰终端气质冲突
2. **大圆角卡片 + 左色条装饰** — 选中只用 2px inset accent，不做 12px+ 营销卡
3. **Emoji 当功能图标** — 使用 1.7 stroke 线性 SVG
4. **展示性字体**（Fraunces 等）或把 Inter 当「品牌展示」堆字重花活
5. **伪造实时行情精度** — 示意数据需可辨；新指标勿装作成交真相
6. **阴影堆叠 elevation 系统** — 默认靠 border；阴影仅抽屉/下拉
7. **暖米色默认画布** — 必须冷蓝灰 `--bg`
8. **accent 大面积铺底** — accent 是点缀不是主题色块
9. **把数字做成比例字体** — 必须 mono + tabular-nums
10. **消费级插画人物/手绘风景** — 本系统无插画层

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
