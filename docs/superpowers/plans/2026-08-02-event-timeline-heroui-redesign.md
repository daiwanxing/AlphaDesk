# Event Timeline HeroUI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将首页事件时间线改为 HeroUI 风格：删除冒烟 Button，Select/Chip/Card 替换原生控件，组内按日分组，MAG7 logo 走 npmmirror CDN。

**Architecture:** 纯前端展示层改动。数据契约与路由不变。新建 `logos.ts` 提供 ticker→CDN URL；`EventTimeline` 改为按日分组；`EventCard` 用 HeroUI `Card`+`Avatar`+`Chip` 横排；首页筛选用 HeroUI `Select`。SCSS 只保留壳层间距。

**Tech Stack:** React 19、Vite 8、TanStack Router、HeroUI React 3.2.3、Tailwind CSS v4、Vitest。

**Specs:**

- Design: `docs/superpowers/specs/2026-08-02-event-timeline-heroui-redesign-design.md`

**Commits:** 本仓库用户规则为「仅在明确要求时 commit」。计划中的 Commit 步骤默认 **跳过**，除非用户说「提交」。

**HeroUI API 注意:** 实现前用 `@heroui/react` 类型 / https://heroui.com/react/llms.txt 核对 `Select`/`Card`/`Chip`/`Avatar` 复合 API；不要用旧 NextUI props。

---

## File map

| Path                                                    | Responsibility                                                                         |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/features/event-track/logos.ts`                     | MAG7 ticker → simple-icons CDN URL + fallback initials（FOMC 不走 CDN，卡片内用 `FO`） |
| `src/features/event-track/logos.test.ts`                | 映射单测                                                                               |
| `src/features/event-track/components/EventCard.tsx`     | 横排 HeroUI 卡片                                                                       |
| `src/features/event-track/components/EventTimeline.tsx` | 按日分组 + StatsBar/Skeleton HeroUI 化                                                 |
| `src/routes/index.tsx`                                  | HeroUI Select 筛选                                                                     |
| `src/routes/__root.tsx`                                 | 删除冒烟 Button                                                                        |
| `src/features/event-track/event-track.scss`             | 删除旧 card/select/stats 外观；保留 layout                                             |
| `src/test/home.test.tsx`                                | 断言不依赖旧 class；覆盖有数据时的按日标题（可选）                                     |

---

### Task 1: logos 映射 + 单测

**Files:**

- Create: `src/features/event-track/logos.ts`
- Create: `src/features/event-track/logos.test.ts`

- [ ] **Step 1: 写失败单测**

```ts
import { describe, expect, it } from "vitest";
import { logoUrlForTicker, fallbackInitials, SIMPLE_ICONS_VERSION } from "./logos";

describe("logos", () => {
  it("pins npmmirror simple-icons URL for MAG7", () => {
    expect(SIMPLE_ICONS_VERSION).toBe("11.6.0");
    expect(logoUrlForTicker("AAPL")).toBe(
      "https://cdn.npmmirror.com/packages/simple-icons/11.6.0/files/icons/apple.svg",
    );
    expect(logoUrlForTicker("NVDA")).toContain("/icons/nvidia.svg");
  });

  it("returns null for unknown ticker", () => {
    expect(logoUrlForTicker("ZZZZ")).toBeNull();
  });

  it("builds fallback initials", () => {
    expect(fallbackInitials("AAPL")).toBe("AA");
    expect(fallbackInitials("MACRO")).toBe("MA");
  });
});
```

- [ ] **Step 2: 跑测确认失败**

Run: `pnpm exec vitest run src/features/event-track/logos.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `logos.ts`**

```ts
/** Pinned: verified 200 on cdn.npmmirror.com (newer majors 404 on this path). */
export const SIMPLE_ICONS_VERSION = "11.6.0";

const TICKER_SLUGS: Record<string, string> = {
  AAPL: "apple",
  MSFT: "microsoft",
  GOOGL: "google",
  AMZN: "amazon",
  META: "meta",
  NVDA: "nvidia",
  TSLA: "tesla",
};

export function logoUrlForTicker(ticker: string): string | null {
  const slug = TICKER_SLUGS[ticker];
  if (!slug) return null;
  return `https://cdn.npmmirror.com/packages/simple-icons/${SIMPLE_ICONS_VERSION}/files/icons/${slug}.svg`;
}

export function fallbackInitials(label: string): string {
  return label.slice(0, 2).toUpperCase();
}
```

- [ ] **Step 4: 跑测确认通过**

Run: `pnpm exec vitest run src/features/event-track/logos.test.ts`
Expected: PASS

- [ ] **Step 5: Commit（默认跳过）**

---

### Task 2: EventCard 横排 HeroUI

**Files:**

- Modify: `src/features/event-track/components/EventCard.tsx`
- Modify: `src/features/event-track/event-track.scss`（可先加 `.event-card-row` 布局类，旧样式稍后 Task 5 删除）

- [ ] **Step 1: 重写 `EventCard.tsx`**

用 HeroUI `Card` / `Avatar` / `Chip`。整卡用 TanStack `Link` 包裹（或 `Card` 的 `render` 渲染为 `a`，但须满足 DOMRender 约束）。推荐结构：

```tsx
import { Link } from "@tanstack/react-router";
import { Avatar, Card, Chip } from "@heroui/react";
import type { TimelineEvent } from "../types";
import { fallbackInitials, logoUrlForTicker } from "../logos";

type Props = { event: TimelineEvent; year: number };

export function EventCard({ event, year }: Props) {
  const isEarnings = event.kind === "earnings";
  const tickerOrMacro = isEarnings ? event.ticker : "MACRO";
  const logoUrl = isEarnings ? logoUrlForTicker(event.ticker) : null;
  const title = isEarnings
    ? `${event.ticker} ${event.reportPeriodLabel}`
    : `FOMC · ${event.meetingLabel}`;
  const typeLabel = isEarnings ? "Earnings" : "Macro";
  const status = isEarnings
    ? event.status === "disclosed"
      ? "已披露"
      : "待披露"
    : event.status === "held"
      ? "已召开"
      : "待召开";
  const statusColor =
    status === "已披露" || status === "已召开"
      ? "success"
      : status === "待披露"
        ? "warning"
        : "default";
  const time = isEarnings ? event.time : undefined;

  return (
    <Link
      to="/events/$eventId"
      params={{ eventId: event.id }}
      search={{ year }}
      className="event-card-link"
    >
      <Card className="event-card-row" variant="secondary">
        <Card.Content className="event-card-row__inner">
          <div className="event-card-row__brand">
            <Avatar size="sm">
              {logoUrl ? <Avatar.Image src={logoUrl} alt="" /> : null}
              <Avatar.Fallback>
                {isEarnings ? fallbackInitials(event.ticker) : "FO"}
              </Avatar.Fallback>
            </Avatar>
            <span className="event-card-row__ticker">{tickerOrMacro}</span>
          </div>
          <div className="event-card-row__body">
            <Card.Title className="event-card-row__title">{title}</Card.Title>
            <div className="event-card-row__meta">
              <Chip size="sm" variant="soft" color={isEarnings ? "accent" : "warning"}>
                <Chip.Label>{typeLabel}</Chip.Label>
              </Chip>
              <Chip size="sm" variant="soft" color={statusColor}>
                <Chip.Label>{status}</Chip.Label>
              </Chip>
              {time ? <span className="event-card-row__time">{time}</span> : null}
            </div>
          </div>
        </Card.Content>
      </Card>
    </Link>
  );
}
```

实现时对照 `@heroui/react` 实际导出的 `Avatar`/`Chip`/`Card` 子组件名；若 `Card.Content` / `Chip.Label` 命名不同，以类型定义为准。日期只出现在日分组标题，卡片上不必重复。

- [ ] **Step 2: 添加最小布局 SCSS**

在 `event-track.scss` 增加（勿删旧规则直到 Task 5）：

```scss
.event-card-link {
  display: block;
  text-decoration: none;
  color: inherit;
}

.event-card-row__inner {
  display: flex;
  align-items: center;
  gap: 0.875rem;
}

.event-card-row__brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 5.5rem;
}

.event-card-row__ticker {
  color: #2f6fed;
  font-weight: 700;
  font-size: 0.8125rem;
}

.event-card-row__body {
  flex: 1;
  min-width: 0;
}

.event-card-row__title {
  font-size: 0.9375rem;
  margin: 0;
}

.event-card-row__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.375rem;
}

.event-card-row__time {
  font-size: 0.75rem;
  color: var(--text);
}
```

- [ ] **Step 3: 类型检查**

Run: `pnpm exec tsc -p tsconfig.app.json --noEmit`
Expected: PASS（若 Avatar/Chip API 不符，按类型错误修正）

- [ ] **Step 4: Commit（默认跳过）**

---

### Task 3: EventTimeline 按日分组 + Stats/Skeleton

**Files:**

- Modify: `src/features/event-track/components/EventTimeline.tsx`

- [ ] **Step 1: 将 `groupByMonth` 改为 `groupByDay`**

```ts
function groupByDay(items: TimelineEvent[]) {
  const groups = new Map<string, TimelineEvent[]>();
  for (const event of items) {
    const dayKey = eventDisplayDate(event); // YYYY-MM-DD
    if (!dayKey) continue;
    const list = groups.get(dayKey) ?? [];
    list.push(event);
    groups.set(dayKey, list);
  }
  return groups;
}

function formatDayHeading(dayKey: string) {
  return new Date(dayKey + "T12:00:00").toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}
```

在 `TimelineSection` 中用 `groupByDay`，label 用 `formatDayHeading`；class 可改为 `timeline__day` / `timeline__day-label`（或暂时复用 month class 名，Task 5 再清）。日内顺序沿用 API 已排序结果，**不必**再 sort（除非发现乱序）。

- [ ] **Step 2: StatsBar → Chip**

```tsx
import { Chip } from "@heroui/react";

export function StatsBar({
  meta,
  className,
}: {
  meta: { earningsDisclosed: number; earningsPending: number; fomc: number };
  className?: string;
}) {
  return (
    <div className={clsx("stats-bar", className)}>
      <Chip size="sm" variant="soft" color="success">
        <Chip.Label>已披露 {meta.earningsDisclosed}</Chip.Label>
      </Chip>
      <Chip size="sm" variant="soft" color="warning">
        <Chip.Label>待披露 {meta.earningsPending}</Chip.Label>
      </Chip>
      <Chip size="sm" variant="soft" color="accent">
        <Chip.Label>FOMC {meta.fomc}</Chip.Label>
      </Chip>
    </div>
  );
}
```

- [ ] **Step 3: TimelineSkeleton → Skeleton（可选轻量）**

```tsx
import { Skeleton } from "@heroui/react";

export function TimelineSkeleton() {
  return (
    <div className="timeline-skeleton" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="timeline-skeleton__row" />
      ))}
    </div>
  );
}
```

对照 Skeleton 实际 API；若 API 不匹配，保留现有骨架 div。

- [ ] **Step 4: 跑现有测试**

Run: `pnpm test`
Expected: PASS（空数据用例仍通过）

- [ ] **Step 5: Commit（默认跳过）**

---

### Task 4: 首页 Select + 删除冒烟 Button

**Files:**

- Modify: `src/routes/index.tsx`
- Modify: `src/routes/__root.tsx`

- [ ] **Step 1: `__root.tsx` 删除 HeroUI Button import 与按钮**

恢复为仅品牌 Link 的 header（可保留 flex header 样式）。

- [ ] **Step 2: `index.tsx` 用 HeroUI Select 替换原生 select**

对照 HeroUI v3 Select 复合用法（`Select` + `Select.Trigger` + `Select.Value` + `Select.Indicator` + `Select.Popover` + `ListBox` / `ListBox.Item`）。示意：

```tsx
import { Label, ListBox, Select } from "@heroui/react";

<div className="filter">
  <Label>年份</Label>
  <Select
    aria-label="年份"
    selectedKey={String(year)}
    onSelectionChange={(key) => {
      if (key == null) return;
      navigate({ search: (prev) => ({ ...prev, year: Number(key) }) });
    }}
  >
    <Select.Trigger>
      <Select.Value />
      <Select.Indicator />
    </Select.Trigger>
    <Select.Popover>
      <ListBox>
        {years.map((y) => (
          <ListBox.Item key={y} id={String(y)} textValue={String(y)}>
            {y}
          </ListBox.Item>
        ))}
      </ListBox>
    </Select.Popover>
  </Select>
</div>;
```

公司筛选同理：`selectedKey={ticker}`，选项为 `all` + `MAG7_TICKERS`。**以当前 `@heroui/react@3.2.3` 类型为准**调整 `onSelectionChange` / `id` / `ListBox.Item` API。

- [ ] **Step 3: tsc + test**

Run: `pnpm exec tsc -p tsconfig.app.json --noEmit && pnpm test`
Expected: PASS

- [ ] **Step 4: Commit（默认跳过）**

---

### Task 5: 清理 SCSS + 验收

**Files:**

- Modify: `src/features/event-track/event-track.scss`
- Modify: `src/test/home.test.tsx`（如需）

- [ ] **Step 1: 删除旧控件样式**

从 `event-track.scss` 删除（或大幅精简）不再使用的规则：

- `.filter select` 相关原生 select 外观
- `.stats-bar__item*` 旧 badge
- `.event-card` / `__meta` / `__type` / `__title` / `__ticker` / `__sub` / `__status*` 旧卡片
- 若已改用 `timeline__day*`，删除或重命名 `timeline__month*`

保留：`.app-shell`、`.app-header`、`.event-track__*` 布局、`.timeline-root`、列表间距、empty/error。

- [ ] **Step 2: 手动验收清单（`pnpm dev`）**

- [ ] Header 无「HeroUI」按钮
- [ ] 年份/公司为 HeroUI Select，改选后 URL search 更新
- [ ] Stats 为 Chip
- [ ] 卡片横排：logo + 蓝色 ticker + title + chips
- [ ] 「即将到来 / 已发生」下按日分组（中文日期标题）
- [ ] 点击卡片进入 `/events/$eventId`
- [ ] Logo CDN 失败时仍显示字母 Fallback（可 DevTools block 域名验证）

- [ ] **Step 3: 全量验证**

Run: `pnpm test && pnpm build`
Expected: 全部 PASS / build 成功

- [ ] **Step 4: Commit（默认跳过）**

---

## Self-review（写计划时已核对）

1. **Spec 覆盖:** 冒烟删除、Select、Chip stats、按日分组、横排 Card、npmmirror logo、中文日标题、详情页不动 — 均有对应 Task。
2. **占位符:** 无 TBD；Select 复合 API 要求实现时对照类型（因 RAC 细节易变）。
3. **类型一致:** `SIMPLE_ICONS_VERSION = "11.6.0"` 与实测 CDN 一致；`logoUrlForTicker` 返回 `string | null`。
4. **YAGNI:** 无详情页、无奶油主题、无 Imp 分数。
