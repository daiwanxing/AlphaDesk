import clsx from "clsx";
import type { TimelineEvent } from "../types";
import { eventDisplayDate } from "../api";
import { EventCard } from "./EventCard";

type Props = {
  events: TimelineEvent[];
  year: number;
  tickerFilter: string | "all";
};

function groupByMonth(items: TimelineEvent[]) {
  const groups = new Map<string, TimelineEvent[]>();
  for (const event of items) {
    const monthKey = eventDisplayDate(event).slice(0, 7);
    if (!monthKey) continue;
    const list = groups.get(monthKey) ?? [];
    list.push(event);
    groups.set(monthKey, list);
  }
  return groups;
}

function TimelineSection({
  title,
  events,
  year,
  emptyHint,
}: {
  title: string;
  events: TimelineEvent[];
  year: number;
  emptyHint?: string;
}) {
  if (events.length === 0) {
    return emptyHint ? <p className="timeline-section__empty muted">{emptyHint}</p> : null;
  }

  const groups = groupByMonth(events);
  return (
    <section className="timeline-section">
      <h2 className="timeline-section__title">{title}</h2>
      <div className="timeline">
        {[...groups.entries()].map(([month, monthEvents]) => (
          <section key={month} className="timeline__month">
            <h3 className="timeline__month-label">
              {new Date(month + "-01T12:00:00").toLocaleDateString("zh-CN", {
                year: "numeric",
                month: "long",
              })}
            </h3>
            <ul className="timeline__list">
              {monthEvents.map((event) => (
                <li key={event.id}>
                  <EventCard event={event} year={year} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}

export function EventTimeline({ events, year, tickerFilter }: Props) {
  const filtered =
    tickerFilter === "all"
      ? events
      : events.filter((e) => e.kind !== "earnings" || e.ticker === tickerFilter);

  if (filtered.length === 0) {
    return (
      <div className="empty-state">
        <p>该年份暂无事件数据，或数据源暂时不可用。</p>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = filtered.filter((e) => eventDisplayDate(e) >= today);
  const past = filtered.filter((e) => eventDisplayDate(e) < today).reverse();

  return (
    <div className="timeline-root">
      <TimelineSection
        title="即将到来"
        events={upcoming}
        year={year}
        emptyHint="所选范围内暂无未来事件。"
      />
      <TimelineSection title="已发生" events={past} year={year} emptyHint="所选范围内暂无历史事件。" />
    </div>
  );
}

export function StatsBar({
  meta,
  className,
}: {
  meta: { earningsDisclosed: number; earningsPending: number; fomc: number };
  className?: string;
}) {
  return (
    <div className={clsx("stats-bar", className)}>
      <span className="stats-bar__item stats-bar__item--ok">已披露 {meta.earningsDisclosed}</span>
      <span className="stats-bar__item stats-bar__item--pending">待披露 {meta.earningsPending}</span>
      <span className="stats-bar__item stats-bar__item--fomc">FOMC {meta.fomc}</span>
    </div>
  );
}

export function TimelineSkeleton() {
  return (
    <div className="timeline-skeleton" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="timeline-skeleton__row" />
      ))}
    </div>
  );
}
