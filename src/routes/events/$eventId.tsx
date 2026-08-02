import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { fetchBriefs, fetchEventDetail, formatDisplayDate } from "@/features/event-track/api";
import { mergeBriefCards } from "@/features/event-track/briefs";
import type { BriefCard } from "@/features/event-track/briefs";
import { AiBriefPanel } from "@/features/event-track/components/AiBriefPanel";
import {
  EARNINGS_STATUS_LABEL,
  FOMC_STATUS_LABEL,
  SLOT_LABEL,
} from "@/features/event-track/labels";
import type { BriefDoc, EventDetailResponse } from "@/features/event-track/types";
import "@/features/event-track/event-track.scss";

type DetailSearch = {
  year?: number;
};

export const Route = createFileRoute("/events/$eventId")({
  validateSearch: (search: Record<string, unknown>): DetailSearch => ({
    year: Number(search.year) || new Date().getFullYear(),
  }),
  component: EventDetailPage,
});

function EventDetailPage() {
  const { eventId } = Route.useParams();
  const year = Route.useSearch().year ?? new Date().getFullYear();
  const [data, setData] = useState<EventDetailResponse | null>(null);
  const [briefCards, setBriefCards] = useState<BriefCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      const detailResult = await fetchEventDetail(year, eventId)
        .then((res) => ({ ok: true as const, res }))
        .catch((err: Error) => ({ ok: false as const, message: err.message }));

      if (cancelled) return;

      if (!detailResult.ok) {
        setData(null);
        setBriefCards([]);
        setError(detailResult.message);
        setLoading(false);
        return;
      }

      setData(detailResult.res);

      let briefs: BriefDoc[] = [];
      let briefsFetchFailed = false;
      try {
        const briefRes = await fetchBriefs(eventId);
        briefs = briefRes.briefs;
      } catch {
        briefsFetchFailed = true;
      }

      if (cancelled) return;
      const cards = mergeBriefCards(detailResult.res.event, briefs, { briefsFetchFailed });
      setBriefCards(cards);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [year, eventId]);

  const event = data?.event;

  return (
    <div className="event-detail">
      <Link to="/" search={{ year }} className="back-link">
        ← 返回时间线
      </Link>

      {loading && <p>加载详情…</p>}
      {error && <p className="event-track__error">{error}</p>}

      {event?.kind === "earnings" && (
        <>
          <header className="detail-header">
            <p className="detail-header__eyebrow">财报 · {event.ticker}</p>
            <h1>{event.companyName}</h1>
            <p className="detail-header__sub">{event.reportPeriodLabel}</p>
          </header>

          <section className="detail-panel">
            <h2>固定信息</h2>
            <dl className="detail-dl">
              <dt>状态</dt>
              <dd>{EARNINGS_STATUS_LABEL[event.status]}</dd>
              {event.scheduledDate && (
                <>
                  <dt>预计披露日</dt>
                  <dd>{formatDisplayDate(event.scheduledDate)}（Nasdaq · 预计）</dd>
                </>
              )}
              {event.actualDate && (
                <>
                  <dt>实际披露日</dt>
                  <dd>{formatDisplayDate(event.actualDate)}</dd>
                </>
              )}
              {event.reportPeriodEnd && (
                <>
                  <dt>报告期结束</dt>
                  <dd>{event.reportPeriodEnd}</dd>
                </>
              )}
              {event.form && (
                <>
                  <dt>Filing 类型</dt>
                  <dd>{event.form}</dd>
                </>
              )}
              {event.accessionNumber && (
                <>
                  <dt>Accession</dt>
                  <dd>{event.accessionNumber}</dd>
                </>
              )}
              {event.cik && (
                <>
                  <dt>CIK</dt>
                  <dd>{event.cik}</dd>
                </>
              )}
              {event.epsForecast && (
                <>
                  <dt>EPS 共识预测</dt>
                  <dd>{event.epsForecast}</dd>
                </>
              )}
              <dt>数据来源</dt>
              <dd>{event.sources.join(" · ")}</dd>
            </dl>
          </section>

          {!loading && <AiBriefPanel cards={briefCards} />}

          <section className="detail-panel">
            <h2>官方材料</h2>
            <div className="official-links">
              {event.irUrl ? (
                <a href={event.irUrl} target="_blank" rel="noreferrer" className="official-link">
                  {event.status === "disclosed"
                    ? "在公司 IR 官网查看业绩材料 →"
                    : "访问公司 IR 官网 →"}
                </a>
              ) : null}
              {event.status === "disclosed" && event.edgarUrl ? (
                <a
                  href={event.edgarUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="official-link official-link--secondary"
                >
                  SEC 法定 filing（核对用）→
                </a>
              ) : null}
              {!event.irUrl && event.status === "pending" && (
                <p className="muted">尚未披露，披露后可在此查看材料链接。</p>
              )}
              {!event.irUrl && event.status === "disclosed" && !event.edgarUrl && (
                <p className="muted">暂无材料链接。</p>
              )}
            </div>
            {event.status === "disclosed" && event.irUrl && (
              <p className="muted detail-panel__hint">
                V1 链至 IR 首页；请在站内查找 {event.reportPeriodLabel} 对应业绩页。
              </p>
            )}
          </section>
        </>
      )}

      {event?.kind === "fomc" && (
        <>
          <header className="detail-header">
            <p className="detail-header__eyebrow">FOMC · 第 {event.sequenceInYear} 场</p>
            <h1>{event.meetingLabel}</h1>
            <p className="detail-header__sub">{formatDisplayDate(event.meetingEndDate)}</p>
          </header>

          <section className="detail-panel">
            <h2>固定信息</h2>
            <dl className="detail-dl">
              <dt>状态</dt>
              <dd>{FOMC_STATUS_LABEL[event.status]}</dd>
              <dt>会议日期</dt>
              <dd>{formatDisplayDate(event.meetingEndDate)}</dd>
              <dt>数据来源</dt>
              <dd>{event.sources.join(" · ")}</dd>
            </dl>
          </section>

          {!loading && <AiBriefPanel cards={briefCards} />}

          <section className="detail-panel">
            <h2>官方材料（方案 B）</h2>
            <ul className="material-list">
              {(["statement", "minutes", "sep"] as const).map((kind) => {
                const items = event.materials.filter((m) => m.kind === kind);
                const label = SLOT_LABEL[kind];
                const published = items.some((i) => i.published);
                return (
                  <li key={kind} className="material-group">
                    <div className="material-group__head">
                      <strong>{label}</strong>
                      <span className={published ? "tag tag--ok" : "tag tag--pending"}>
                        {published
                          ? "已发布"
                          : kind === "sep" && event.status === "held"
                            ? "本次会议不含 SEP"
                            : "尚未发布"}
                      </span>
                    </div>
                    {published ? (
                      <ul className="material-links">
                        {items.map((m) => (
                          <li key={m.url}>
                            <a href={m.url} target="_blank" rel="noreferrer">
                              {m.label}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
