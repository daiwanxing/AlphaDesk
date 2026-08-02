# 事件时间线 HeroUI 改版 — 技术设计

**日期：** 2026-08-02  
**状态：** 草案（头脑风暴已对齐，待实现计划）  
**文档类型：** 技术设计（HOW）  
**范围：** 首页事件时间线 UI（`/`）；不改详情页与后端数据契约

---

## 0. 已拍板产品决策

| 项           | 决策                                                                           |
| ------------ | ------------------------------------------------------------------------------ |
| 冒烟 Button  | **删除** header 上的 HeroUI 测试按钮                                           |
| 实现路径     | **渐进替换**：首页 Select / Stats / EventCard / 分组；详情页不动               |
| 分组         | 保留「即将到来 / 已发生」；**组内按日**（不再按月）                            |
| 卡片布局     | 对齐参考截图横排：`Avatar + 蓝色 ticker \| 标题 + Type/Status Chip + 可选时间` |
| 卡片元信息   | 类型 Chip + 状态 Chip；有 `time` 才显示时间（无 Imp 分数 / 无 Tap to expand）  |
| Logo         | **运行时 CDN**：`cdn.npmmirror.com` 上的 simple-icons SVG                      |
| 日期标题文案 | **中文**（贴合现有产品语气）                                                   |
| 全站换肤     | **不做**奶油色底；沿用现有页面色，卡片用 HeroUI 默认表面                       |

---

## 1. 架构与文件边界

### 1.1 原则

- 只改前端展示层；`TimelineEvent` / API / 路由 search params **契约不变**。
- 组件优先 HeroUI v3 复合 API（`Card` / `Select` / `Chip` / `Avatar` / `Label` / `Skeleton`），以官方类型与文档为准，不依赖记忆中的旧 NextUI API。
- SCSS 收敛为壳层布局与间距；去掉旧 `.event-card` / `.filter select` / `.stats-bar` 等自定义控件外观。

### 1.2 主要文件

| 文件                                                    | 变更                                                      |
| ------------------------------------------------------- | --------------------------------------------------------- |
| `src/routes/__root.tsx`                                 | 删除冒烟 `Button`                                         |
| `src/routes/index.tsx`                                  | 年份/公司筛选改为 HeroUI `Select`；Stats 用 `Chip`        |
| `src/features/event-track/components/EventTimeline.tsx` | 按日分组；StatsBar / Skeleton 换 HeroUI                   |
| `src/features/event-track/components/EventCard.tsx`     | 横排 HeroUI `Card` + `Avatar` + `Chip`                    |
| `src/features/event-track/logos.ts`（新建）             | ticker → simple-icons slug / CDN URL；FOMC 标识           |
| `src/features/event-track/event-track.scss`             | 删除旧 card/select/stats 样式；保留 shell / timeline 间距 |
| `src/test/home.test.tsx`                                | 断言改为文本 / role，不依赖旧 class                       |

### 1.3 逻辑流（展示）

```text
[首页 /]
  → 工具栏：Select(年份) + Select(公司) + Chip 统计
  → 时间线：即将到来 | 已发生
       → 每个 section 内按 YYYY-MM-DD 分组
       → 日标题（中文）
       → EventCard 列表（整卡 Link 到 /events/$eventId）
```

---

## 2. UI 规格

### 2.1 EventCard

整卡可点，目标路由不变：`/events/$eventId?year=`。

**Earnings**

| 槽位        | 内容                                      |
| ----------- | ----------------------------------------- |
| Avatar      | CDN logo；失败 Fallback = ticker 前两字母 |
| 左文字      | 蓝色 `ticker`                             |
| 标题        | `{ticker} {reportPeriodLabel}`            |
| Type Chip   | `Earnings`（accent / soft）               |
| Status Chip | `已披露` success；`待披露` warning        |
| 时间        | 仅当 `event.time` 存在时显示              |

**FOMC**

| 槽位        | 内容                                                    |
| ----------- | ------------------------------------------------------- |
| Avatar      | 简化 MACRO 标识（CDN 或本地小 SVG）；失败 Fallback `FO` |
| 左文字      | 蓝色 `MACRO`                                            |
| 标题        | `FOMC · {meetingLabel}`                                 |
| Type Chip   | `Macro`（warning / soft）                               |
| Status Chip | `已召开` success；`待召开` default                      |

实现提示：若 HeroUI `Card` 不直接支持 `as={Link}`，用 `Card` 包在 `Link` 内或使用文档推荐的 polymorphic / render props，保证键盘与读屏可用。

### 2.2 分组

1. 过滤 ticker（现有逻辑）。
2. 按今日切分 upcoming / past（现有逻辑）。
3. 各列表内按 `eventDisplayDate(event)` 的 `YYYY-MM-DD` 分组。
4. 日标题：`toLocaleDateString("zh-CN", { year, month, day, weekday })`。
5. upcoming 日内事件升序；past section 整体仍按「近→远」展示（与现网一致），日内保持该日自然顺序。

### 2.3 筛选与 Stats

- `Select`：`selectedKey` = 当前 year / ticker；`onSelectionChange` → `navigate({ search })`。
- StatsBar：三个 `Chip`（已披露 / 待披露 / FOMC），颜色分别 success / warning / accent（或 default）。

### 2.4 Logo CDN

- Base（pin 版本，避免浮动破坏）：  
  `https://cdn.npmmirror.com/packages/simple-icons/<version>/files/icons/<slug>.svg`
- 映射：

| Ticker | slug      |
| ------ | --------- |
| AAPL   | apple     |
| MSFT   | microsoft |
| GOOGL  | google    |
| AMZN   | amazon    |
| META   | meta      |
| NVDA   | nvidia    |
| TSLA   | tesla     |

- 实现时读取 npmmirror 上可用的 simple-icons 版本号并写入常量；`<img>` / `Avatar.Image` 加载失败走 Fallback。
- FOMC：不依赖商业品牌 logo；使用独立 slug（若无合适图标则用字母 Fallback 或仓库内极小 SVG）。**不**使用 Clearbit / 海外 logo API。

---

## 3. 失败态与空态

| 场景              | 行为                                       |
| ----------------- | ------------------------------------------ |
| Logo 加载失败     | Avatar Fallback 字母                       |
| 时间线 loading    | HeroUI `Skeleton` 若干行（或保留轻量骨架） |
| fetch 错误        | 现有错误文案；可用 `Alert` 轻量包裹        |
| 无事件 / 过滤为空 | 现有 empty-state 文案不变                  |

---

## 4. 测试与验收

### 4.1 测试

- 更新 `home.test.tsx`：仍能找到品牌副文案与空状态文案；不依赖 `.event-card`。
- 可选：`logos.ts` 映射单测（ticker → slug / URL 含 npmmirror）。
- `pnpm test` 与 `pnpm build` 必须通过。

### 4.2 验收清单

- [ ] Header 无「HeroUI」冒烟按钮
- [ ] 年份 / 公司为 HeroUI Select
- [ ] Stats 为 Chip
- [ ] 卡片横排接近参考截图（logo + ticker + chips）
- [ ] 「即将到来 / 已发生」+ 按日分组
- [ ] 点击卡片进入既有详情路由
- [ ] 详情页视觉未要求变更

---

## 5. 明确不做

- 事件详情页 HeroUI 改版
- 全站奶油色 / stockcatalysts 主题复制
- Importance 分数、`Tap to expand` 文案
- 将 logo 打进仓库（本版选择 CDN）
- 变更后端事件 JSON 字段

---

## 6. 风险与缓解

| 风险                                     | 缓解                                         |
| ---------------------------------------- | -------------------------------------------- |
| npmmirror / simple-icons 路径或版本变更  | pin 版本；Fallback 字母                      |
| CDN 在部分网络仍慢                       | SVG 极小；失败不挡交互                       |
| HeroUI Select + TanStack search 受控细节 | 对照官方 Select 示例；单测覆盖筛选后 URL     |
| Card 可点击无障碍                        | 优先真实 `Link`/`a`，避免仅 `onClick` 的 div |
