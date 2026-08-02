import { TURNOVER_LABELS } from "../labels";
import { isSnapshotSession } from "../session";
import type { MarketSession, MarketTurnoverResponse, TurnoverPoint } from "../types";
import { LoadingOverlay } from "@/shared/components/LoadingOverlay";
import "../market-turnover.scss";
import { AmountFlow, DeltaFlow } from "./AmountFlow";
import { IntradayTurnoverChart } from "./IntradayTurnoverChart";

const SCOPE = "口径：上证 + 深成指 + 北证50";

const SESSION_META: Record<MarketSession, { label: string; tagClass: string }> = {
  continuous: { label: "盘中", tagClass: "tag tag--success" },
  lunch: { label: "午休 · 暂停刷新", tagClass: "tag tag--warn" },
  closed: { label: "已收盘", tagClass: "tag" },
  weekend: { label: "周末休市", tagClass: "tag" },
  pre_open: { label: "未开盘", tagClass: "tag tag--info" },
};

const EMPTY_POINTS: TurnoverPoint[] = [];

type TurnoverBoardProps = {
  data: MarketTurnoverResponse | null;
  session: MarketSession;
  loading: boolean;
  error: string | null;
  configError: string | null;
};

function boardSubtitle(session: MarketSession): string {
  if (isSnapshotSession(session)) return `${SCOPE} · 休市快照对比`;
  if (session === "closed") return `${SCOPE} · 全日对比`;
  return `${SCOPE} · 同时刻累计对比`;
}

function deltaTone(delta: number): string {
  if (delta > 0) return "od-up";
  if (delta < 0) return "od-down";
  return "od-muted";
}

function asOfLabel(session: MarketSession): string {
  return isSnapshotSession(session) || session === "closed" ? "数据时间" : "更新时间";
}

export function TurnoverBoard({ data, session, loading, error, configError }: TurnoverBoardProps) {
  const showInitialSpinner = loading && !data;

  return (
    <div className="turnover-board">
      <LoadingOverlay loading={showInitialSpinner} label="加载成交额…" />
      <header className="turnover-board__header">
        <div className="turnover-board__heading">
          <h1 className="turnover-board__title">A股量能</h1>
          <p className="turnover-board__subtitle">{boardSubtitle(session)}</p>
        </div>
        <div className="turnover-board__meta">
          <span className={SESSION_META[session].tagClass}>{SESSION_META[session].label}</span>
          {data && (
            <time className="turnover-board__asof num" dateTime={data.asOf}>
              {asOfLabel(session)} {new Date(data.asOf).toLocaleString("zh-CN", { hour12: false })}
            </time>
          )}
        </div>
      </header>

      {configError && (
        <div className="note-box note-box--danger" role="alert">
          <p className="note-box__title">未配置数据源</p>
          <p className="note-box__body">{configError}</p>
        </div>
      )}

      {error && (
        <div className="note-box note-box--warn" role="alert">
          <p className="note-box__title">数据更新失败</p>
          <p className="note-box__body">
            {error}
            {data ? " · 已保留上一帧数据" : ""}
          </p>
        </div>
      )}

      {data && <TurnoverBody data={data} />}
    </div>
  );
}

function TurnoverBody({ data }: { data: MarketTurnoverResponse }) {
  const today = data.series?.today ?? EMPTY_POINTS;
  const prev = data.series?.prev ?? EMPTY_POINTS;
  const showPrev = data.compareMode === "vs_prev_same_time" && prev.length > 0;

  return (
    <>
      <dl className="turnover-kpi">
        <div className="turnover-kpi__card">
          <dt className="turnover-kpi__label">{TURNOVER_LABELS.primary}</dt>
          <dd className="turnover-kpi__value num">
            <AmountFlow yuan={data.total.amount} />
          </dd>
        </div>
        <div className="turnover-kpi__card">
          <dt className="turnover-kpi__label">{TURNOVER_LABELS.secondary}</dt>
          <dd className="turnover-kpi__value num">
            <AmountFlow yuan={data.total.prevFullDayAmount} />
          </dd>
        </div>
        <div className="turnover-kpi__card">
          <dt className="turnover-kpi__label">{TURNOVER_LABELS.delta}</dt>
          <dd className={`turnover-kpi__value is-delta ${deltaTone(data.total.delta)}`}>
            <DeltaFlow delta={data.total.delta} pct={data.total.deltaPct} />
          </dd>
        </div>
      </dl>

      <section className="turnover-panel">
        <h2 className="turnover-panel__title">市场成交额</h2>
        <IntradayTurnoverChart prev={prev} showPrev={showPrev} today={today} />
      </section>
    </>
  );
}
