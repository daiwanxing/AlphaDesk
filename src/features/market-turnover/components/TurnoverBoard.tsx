import { Alert, Button, Card, Chip, Spinner } from "@heroui/react";
import { formatAmountYuan, formatDelta } from "../format";
import type { MarketSession, MarketTurnoverMarket, MarketTurnoverResponse } from "../types";

const SESSION_BADGE: Record<MarketSession, string> = {
  continuous: "盘中",
  lunch: "午休 · 暂停刷新",
  closed: "已收盘",
  weekend: "周末休市",
  pre_open: "未开盘",
};

const SESSION_CHIP_COLOR: Record<
  MarketSession,
  "success" | "warning" | "default" | "accent" | "danger"
> = {
  continuous: "success",
  lunch: "warning",
  closed: "default",
  weekend: "default",
  pre_open: "accent",
};

type TurnoverBoardProps = {
  data: MarketTurnoverResponse | null;
  session: MarketSession;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  configError: string | null;
  onRefresh: () => void;
};

function deltaClass(delta: number): string {
  if (delta > 0) return "text-emerald-600 dark:text-emerald-400";
  if (delta < 0) return "text-rose-600 dark:text-rose-400";
  return "text-slate-500";
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

function compareHint(session: MarketSession, disclaimer: string): string {
  if (session === "weekend") {
    return "展示最近交易日收盘快照 · 较再上一交易日";
  }
  if (session === "continuous") {
    return `${disclaimer} · 盘中为进度对比`;
  }
  return disclaimer;
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
    <Card className="flex flex-col gap-3 p-4">
      <Card.Header className="flex flex-col items-start gap-1 p-0">
        <Card.Title className="text-base font-semibold">{market.label}</Card.Title>
        <Card.Description className="text-xs text-slate-500">{sourceNote}</Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col gap-2 p-0">
        <p className="text-xs text-slate-500">{amountLabel(session, snapshotTradeDate)}</p>
        <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
          {formatAmountYuan(market.amount)}
        </p>
        <p className={`text-sm tabular-nums ${deltaClass(market.delta)}`}>
          较上日 {formatDelta(market.delta, market.deltaPct)}
        </p>
      </Card.Content>
    </Card>
  );
}

export function TurnoverBoard({
  data,
  session,
  loading,
  refreshing,
  error,
  configError,
  onRefresh,
}: TurnoverBoardProps) {
  const showInitialSpinner = loading && !data;
  const disclaimer = data?.disclaimer ?? "盘中对比昨收全天 · 非同时刻";

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-xl font-semibold text-slate-900 dark:text-slate-100">A股量能</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Chip color={SESSION_CHIP_COLOR[session]} size="sm" variant="soft">
              {SESSION_BADGE[session]}
            </Chip>
            {session === "weekend" && (
              <span className="text-sm text-slate-500">下一交易日开盘后恢复实时更新</span>
            )}
            {session === "continuous" && (
              <span className="text-sm text-slate-500">自动刷新中（约 15 秒）</span>
            )}
          </div>
        </div>
        <Button
          isDisabled={refreshing || Boolean(configError)}
          onPress={onRefresh}
          size="sm"
          variant="secondary"
        >
          {refreshing ? (
            <span className="inline-flex items-center gap-2">
              <Spinner size="sm" />
              刷新中
            </span>
          ) : (
            "手动刷新"
          )}
        </Button>
      </header>

      {configError && (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>未配置数据源</Alert.Title>
            <Alert.Description>{configError}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {error && (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>数据更新失败</Alert.Title>
            <Alert.Description>
              {error}
              {data ? " · 已保留上一帧数据" : ""}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {showInitialSpinner && (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
          <Spinner />
          <span>加载成交额…</span>
        </div>
      )}

      {data && (
        <>
          <p className="m-0 text-sm text-slate-500">{compareHint(session, disclaimer)}</p>

          <div className="grid gap-4 sm:grid-cols-3">
            {data.markets.map((market) => (
              <MarketCard
                key={market.id}
                market={market}
                session={session}
                snapshotTradeDate={data.snapshotTradeDate}
              />
            ))}
          </div>

          <Card className="p-4">
            <Card.Content className="flex flex-wrap items-baseline justify-between gap-3 p-0">
              <div>
                <p className="m-0 text-sm text-slate-500">沪深京合计</p>
                <p className="m-0 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {formatAmountYuan(data.total.amount)}
                </p>
              </div>
              <p className={`m-0 text-sm tabular-nums ${deltaClass(data.total.delta)}`}>
                较上日 {formatDelta(data.total.delta, data.total.deltaPct)}
              </p>
            </Card.Content>
          </Card>

          <p className="m-0 text-xs text-slate-500">
            数据更新时间：{new Date(data.asOf).toLocaleString("zh-CN", { hour12: false })}
          </p>
        </>
      )}
    </div>
  );
}
