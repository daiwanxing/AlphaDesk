import type { MarketSession } from "@contracts/market-turnover";

export function isSnapshotSession(session: MarketSession): boolean {
  return session === "weekend" || session === "pre_open";
}
