import { ChartSpline } from "lucide-react";
import type { MarketSession } from "@contracts/market-turnover";
import type { SectorFundFlowSeries } from "@contracts/sector-fund-flow";
import { SECTION_TITLE_ICON } from "@/features/market-turnover/icons";
import { LoadingOverlay } from "@/shared/components/LoadingOverlay";
import { SectorFundFlowChart } from "./SectorFundFlowChart";
import "../sector-fund-flow.scss";

type Props = {
  sectors: SectorFundFlowSeries[];
  loading: boolean;
  error: string | null;
  session: MarketSession;
};

function emptyHint(session: MarketSession): string {
  if (session === "pre_open" || session === "weekend") return "盘前暂无分时资金流";
  if (session === "lunch") return "午休时段暂无更新";
  return "暂无分时资金流";
}

export function SectorFundFlowSection({ sectors, loading, error, session }: Props) {
  const showInitialSpinner = loading && sectors.length === 0;
  const showEmpty = !loading && !error && sectors.length === 0;

  return (
    <section className="sector-flow">
      <LoadingOverlay loading={showInitialSpinner} label="加载板块资金…" />

      {error && (
        <div className="note-box note-box--warn" role="alert">
          <p className="note-box__title">板块资金更新失败</p>
          <p className="note-box__body">
            {error}
            {sectors.length > 0 ? " · 已保留上一帧数据" : ""}
          </p>
        </div>
      )}

      {showEmpty ? (
        <section className="turnover-panel sector-flow__panel">
          <h2 className="turnover-panel__title">
            <ChartSpline {...SECTION_TITLE_ICON} />
            板块资金流向
          </h2>
          <p className="sector-flow__empty muted">{emptyHint(session)}</p>
        </section>
      ) : null}

      {sectors.length > 0 ? (
        <section className="turnover-panel sector-flow__panel">
          <h2 className="turnover-panel__title">
            <ChartSpline {...SECTION_TITLE_ICON} />
            板块资金流向
          </h2>
          <SectorFundFlowChart sectors={sectors} />
        </section>
      ) : null}
    </section>
  );
}
