import { formatAmountYuan, formatDelta } from "../format";
import { kpiLabels } from "../kpi-labels";
import type { MarketSession, MarketTurnoverResponse, TurnoverPoint } from "../types";
import "../market-turnover.scss";
import { IntradayTurnoverChart } from "./IntradayTurnoverChart";

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

function deltaTone(delta: number): string {
  if (delta > 0) return "delta delta--up";
  if (delta < 0) return "delta delta--down";
  return "delta";
}

function shortDate(tradeDate: string | undefined): string | null {
  const matched = /^\d{4}-(\d{2})-(\d{2})$/.exec(tradeDate ?? "");
  return matched ? `${matched[1]}-${matched[2]}` : null;
}

function seriesLabels(session: MarketSession, data: MarketTurnoverResponse) {
  const snapshot = session === "weekend" || session === "pre_open";
  const primaryWord = snapshot ? "上交易日" : "今日";
  const prevWord = snapshot ? "再上一日" : "昨日";
  const primaryDate = shortDate(data.series?.tradeDate);
  const prevDate = shortDate(data.series?.prevTradeDate);

  return {
    primaryLabel: primaryDate ? `${primaryWord} ${primaryDate}` : primaryWord,
    prevLabel: prevDate ? `${prevWord} ${prevDate}` : prevWord,
  };
}

export function TurnoverBoard({ data, session, loading, error, configError }: TurnoverBoardProps) {
  const showInitialSpinner = loading && !data;

  return (
    <div className="turnover-board">
      <header className="turnover-board__header">
        <h1 className="turnover-board__title">A股量能</h1>
        <span className={SESSION_META[session].tagClass}>{SESSION_META[session].label}</span>
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

      {showInitialSpinner && <p className="turnover-board__loading">加载成交额…</p>}

      {data && <TurnoverBody data={data} session={session} />}
    </div>
  );
}

function TurnoverBody({ data, session }: { data: MarketTurnoverResponse; session: MarketSession }) {
  const labels = kpiLabels(session);
  const { primaryLabel, prevLabel } = seriesLabels(session, data);
  const today = data.series?.today ?? EMPTY_POINTS;
  const prev = data.series?.prev ?? EMPTY_POINTS;
  const showPrev = data.compareMode === "vs_prev_same_time" && prev.length > 0;

  return (
    <>
      {data.disclaimer && <p className="turnover-board__disclaimer">{data.disclaimer}</p>}

      <dl className="turnover-kpi">
        <div className="turnover-kpi__cell">
          <dt className="turnover-kpi__label">{labels.primary}</dt>
          <dd className="turnover-kpi__value num">{formatAmountYuan(data.total.amount)}</dd>
        </div>
        <div className="turnover-kpi__cell">
          <dt className="turnover-kpi__label">{labels.secondary}</dt>
          <dd className="turnover-kpi__value num">
            {formatAmountYuan(data.total.prevFullDayAmount)}
          </dd>
        </div>
        <div className="turnover-kpi__cell">
          <dt className="turnover-kpi__label">{labels.delta}</dt>
          <dd className={`turnover-kpi__value ${deltaTone(data.total.delta)}`}>
            {formatDelta(data.total.delta, data.total.deltaPct)}
          </dd>
        </div>
      </dl>

      <div className="turnover-legend">
        <span className="turnover-legend__item turnover-legend__item--primary">{primaryLabel}</span>
        {showPrev && (
          <span className="turnover-legend__item turnover-legend__item--prev">{prevLabel}</span>
        )}
      </div>

      <IntradayTurnoverChart
        prev={prev}
        prevLabel={prevLabel}
        primaryLabel={primaryLabel}
        showPrev={showPrev}
        today={today}
      />

      <p className="turnover-board__asof num">
        数据更新时间：
        {new Date(data.asOf).toLocaleString("zh-CN", { hour12: false })}
      </p>
    </>
  );
}
