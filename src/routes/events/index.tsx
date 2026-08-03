import { createFileRoute, useElementScrollRestoration } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useState } from "react";
import { fetchTimeline, requestBriefBackfill } from "@/services/event-track";
import { EventTimeline, StatsBar } from "@/features/event-track/components/EventTimeline";
import { LoadingOverlay } from "@/shared/components/LoadingOverlay";
import type { TimelineResponse } from "@contracts/event-track";
import { MAG7_TICKERS } from "@/features/event-track/types";
import "@/features/event-track/event-track.scss";

type EventsSearch = {
  year?: number;
  ticker?: string;
};

export const Route = createFileRoute("/events/")({
  validateSearch: (search: Record<string, unknown>): EventsSearch => ({
    year: Number(search.year) || new Date().getFullYear(),
    ticker: typeof search.ticker === "string" ? search.ticker : "all",
  }),
  component: EventTrackPage,
});

function EventTrackPage() {
  const search = Route.useSearch();
  const year = search.year ?? new Date().getFullYear();
  const ticker = search.ticker ?? "all";
  const navigate = Route.useNavigate();
  const scrollEntry = useElementScrollRestoration({ id: "content-pane" });
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    const pane = document.querySelector<HTMLElement>(".content-pane");
    const target = scrollEntry?.scrollY;
    if (!pane || loading || !data || target == null) return;

    const maxScrollTop = Math.max(0, pane.scrollHeight - pane.clientHeight);
    const restoredScrollTop = Math.min(target, maxScrollTop);
    pane.scrollTop = restoredScrollTop;
  }, [data, loading, scrollEntry?.scrollY]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchTimeline(year)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    void requestBriefBackfill(year).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [year]);

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  return (
    <div className="event-track">
      <LoadingOverlay loading={loading} label="加载事件追踪…" />
      <header className="event-track__toolbar">
        <div className="event-track__filters">
          <label className="filter">
            <span className="filter__label">年份</span>
            <select
              className="filter__control"
              aria-label="年份"
              value={year}
              onChange={(e) => {
                navigate({ search: (prev) => ({ ...prev, year: Number(e.target.value) }) });
              }}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="filter">
            <span className="filter__label">公司</span>
            <select
              className="filter__control"
              aria-label="公司"
              value={ticker}
              onChange={(e) => {
                navigate({ search: (prev) => ({ ...prev, ticker: e.target.value }) });
              }}
            >
              <option value="all">全部七姐妹</option>
              {MAG7_TICKERS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>
        {data && <StatsBar meta={data.meta} />}
      </header>

      {!loading && error && (
        <div className="note-box note-box--danger" role="alert">
          <p className="note-box__title">加载失败</p>
          <p className="note-box__body">
            {error}
            <br />
            请使用 `pnpm dev` 或部署后访问。
          </p>
        </div>
      )}
      {data && !loading && !error && (
        <>
          <EventTimeline events={data.events} year={year} tickerFilter={ticker} />
          <p className="event-track__updated mono">
            更新于 {new Date(data.updatedAt).toLocaleString("zh-CN", { hour12: false })}
          </p>
        </>
      )}
    </div>
  );
}
