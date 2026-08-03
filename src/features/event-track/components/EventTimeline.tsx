import clsx from "clsx";
import type { TimelineEvent } from "@contracts/event-track";
import { eventDisplayDate } from "../lib/dates";
import { EventCard } from "./EventCard";

type Props = {
  events: TimelineEvent[];
  year: number;
  tickerFilter: string | "all";
};

function groupByDay(items: TimelineEvent[]) {
  const groups = new Map<string, TimelineEvent[]>();
  for (const event of items) {
    const dayKey = eventDisplayDate(event);
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

function TimelineSection({
  title,
  tone,
  events,
  year,
  todayKey,
  emptyHint,
}: {
  title: string;
  tone: "upcoming" | "past";
  events: TimelineEvent[];
  year: number;
  todayKey: string;
  emptyHint?: string;
}) {
  if (events.length === 0) {
    return emptyHint ? <p className="timeline-section__empty muted">{emptyHint}</p> : null;
  }

  const groups = groupByDay(events);
  return (
    <section className={clsx("timeline-section", `timeline-section--${tone}`)}>
      <h2 className="timeline-section__title">{title}</h2>
      <div className="timeline">
        {[...groups.entries()].map(([day, dayEvents]) => (
          <section key={day} className="timeline__day">
            <h3 className="timeline__day-label">{formatDayHeading(day)}</h3>
            <ul className="timeline-list">
              {dayEvents.map((event) => (
                <li key={event.id}>
                  <EventCard event={event} year={year} todayKey={todayKey} />
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

  const todayKey = new Date().toISOString().slice(0, 10);
  const upcoming: TimelineEvent[] = [];
  const past: TimelineEvent[] = [];
  for (const event of filtered) {
    if (eventDisplayDate(event) >= todayKey) upcoming.push(event);
    else past.push(event);
  }
  past.reverse();

  return (
    <div className="timeline-root">
      <TimelineSection
        title="即将到来"
        tone="upcoming"
        events={upcoming}
        year={year}
        todayKey={todayKey}
        emptyHint="所选范围内暂无未来事件。"
      />
      <TimelineSection
        title="已发生"
        tone="past"
        events={past}
        year={year}
        todayKey={todayKey}
        emptyHint="所选范围内暂无历史事件。"
      />
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
      <span className="tag tag--success">已披露 {meta.earningsDisclosed}</span>
      <span className="tag tag--warn">待披露 {meta.earningsPending}</span>
      <span className="tag tag--info">FOMC {meta.fomc}</span>
    </div>
  );
}
