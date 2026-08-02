import { createFileRoute } from "@tanstack/react-router";
import { Label, ListBox, Select } from "@heroui/react";
import { useEffect, useState } from "react";
import { fetchTimeline, requestBriefBackfill } from "@/features/event-track/api";
import {
  EventTimeline,
  StatsBar,
  TimelineSkeleton,
} from "@/features/event-track/components/EventTimeline";
import { MAG7_TICKERS, type TimelineResponse } from "@/features/event-track/types";
import "@/features/event-track/event-track.scss";

type HomeSearch = {
  year?: number;
  ticker?: string;
};

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
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
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

    // 切年补扫 AI 缺口；失败静默，不影响时间线
    void requestBriefBackfill(year).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [year]);

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  return (
    <div className="event-track">
      <header className="event-track__toolbar">
        <div className="event-track__filters">
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
          </div>
          <div className="filter">
            <Label>公司</Label>
            <Select
              aria-label="公司"
              selectedKey={ticker}
              onSelectionChange={(key) => {
                if (key == null) return;
                navigate({ search: (prev) => ({ ...prev, ticker: String(key) }) });
              }}
            >
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item id="all" textValue="全部七姐妹">
                    全部七姐妹
                  </ListBox.Item>
                  {MAG7_TICKERS.map((t) => (
                    <ListBox.Item key={t} id={t} textValue={t}>
                      {t}
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
          </div>
        </div>
        {data && <StatsBar meta={data.meta} />}
      </header>

      {loading && <TimelineSkeleton />}
      {!loading && error && (
        <div className="event-track__error" role="alert">
          <p>{error}</p>
          <p className="muted">请使用 `pnpm dev` 或 `vercel dev` / 部署后访问。</p>
        </div>
      )}
      {data && !loading && !error && (
        <>
          <p className="event-track__note muted">
            已披露：主链公司 IR；SEC EDGAR 供核对。待披露日程来自 Nasdaq Calendar。FOMC 来自 Federal
            Reserve。预计日仅供参考。
          </p>
          <EventTimeline events={data.events} year={year} tickerFilter={ticker} />
          <p className="event-track__updated muted">
            更新于 {new Date(data.updatedAt).toLocaleString("zh-CN")}
          </p>
        </>
      )}
    </div>
  );
}
