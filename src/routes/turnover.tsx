import { createFileRoute } from "@tanstack/react-router";
import { TurnoverBoard } from "@/features/market-turnover/components/TurnoverBoard";
import { useMarketTurnover } from "@/features/market-turnover/useMarketTurnover";
import { SectorFundFlowSection } from "@/features/sector-fund-flow/components/SectorFundFlowSection";
import { useSectorFundFlow } from "@/features/sector-fund-flow/useSectorFundFlow";

export const Route = createFileRoute("/turnover")({
  component: TurnoverPage,
});

function TurnoverPage() {
  const turnover = useMarketTurnover();
  const fundFlow = useSectorFundFlow(turnover.session);

  return (
    <TurnoverBoard
      configError={turnover.configError}
      data={turnover.data}
      error={turnover.error}
      loading={turnover.loading}
      session={turnover.session}
    >
      <SectorFundFlowSection
        sectors={fundFlow.sectors}
        error={fundFlow.error}
        loading={fundFlow.loading}
        session={turnover.session}
      />
    </TurnoverBoard>
  );
}
