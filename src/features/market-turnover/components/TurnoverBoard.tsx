import { formatAmountYuan, formatDelta } from "../format";
import type { MarketSession, MarketTurnoverMarket, MarketTurnoverResponse } from "../types";
import "../market-turnover.scss";

const SESSION_META: Record<MarketSession, { label: string; tagClass: string }> = {
  continuous: { label: "盘中", tagClass: "tag tag--success" },
  lunch: { label: "午休 · 暂停刷新", tagClass: "tag tag--warn" },
  closed: { label: "已收盘", tagClass: "tag" },
  weekend: { label: "周末休市", tagClass: "tag" },
  pre_open: { label: "未开盘", tagClass: "tag tag--info" },
};

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

function amountLabel(session: MarketSession, snapshotTradeDate?: string): string {
  if (session === "weekend") {
    return snapshotTradeDate ? `上交易日（${snapshotTradeDate}）成交额` : "上交易日成交额";
  }
  if (session === "closed") {
    return "本日全天成交额";
  }
  return "今日成交额";
}

function MarketCard({
  market,
  session,
  snapshotTradeDate,
}: {
  market: MarketTurnoverMarket;
  session: MarketSession;
  snapshotTradeDate?: string;
}) {
  const isSz = market.id === "sz";
  const sourceNote = isSz ? `${market.source} · 成指口径` : market.source;

  return (
    <article className="turnover-card">
      <header className="turnover-card__head">
        <h2 className="turnover-card__title">{market.label}</h2>
        <p className="turnover-card__source">{sourceNote}</p>
      </header>
      <p className="turnover-card__label">{amountLabel(session, snapshotTradeDate)}</p>
      <p className="turnover-card__amount num">{formatAmountYuan(market.amount)}</p>
      <p className={deltaTone(market.delta)}>较上日 {formatDelta(market.delta, market.deltaPct)}</p>
    </article>
  );
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

      {data && (
        <>
          <div className="turnover-grid">
            {data.markets.map((market) => (
              <MarketCard
                key={market.id}
                market={market}
                session={session}
                snapshotTradeDate={data.snapshotTradeDate}
              />
            ))}
          </div>

          <div className="turnover-total">
            <div>
              <p className="turnover-card__label">沪深京合计</p>
              <p className="turnover-card__amount num">{formatAmountYuan(data.total.amount)}</p>
            </div>
            <p className={deltaTone(data.total.delta)}>
              较上日 {formatDelta(data.total.delta, data.total.deltaPct)}
            </p>
          </div>

          <p className="turnover-board__asof num">
            数据更新时间：
            {new Date(data.asOf).toLocaleString("zh-CN", { hour12: false })}
          </p>
        </>
      )}
    </div>
  );
}
