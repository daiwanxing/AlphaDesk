import { createFileRoute } from "@tanstack/react-router";
import { TurnoverBoard } from "@/features/market-turnover/components/TurnoverBoard";
import { useMarketTurnover } from "@/features/market-turnover/useMarketTurnover";

export const Route = createFileRoute("/turnover")({
  component: TurnoverPage,
});

function TurnoverPage() {
  const { configError, data, error, loading, session } = useMarketTurnover();

  return (
    <TurnoverBoard
      configError={configError}
      data={data}
      error={error}
      loading={loading}
      session={session}
    />
  );
}
