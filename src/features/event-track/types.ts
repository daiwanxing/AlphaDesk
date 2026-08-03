import type { BriefDoc as BriefDocContract } from "@contracts/briefs";

export type {
  EarningsEvent,
  EventDetailResponse,
  FomcEvent,
  TimelineEvent,
  TimelineResponse,
} from "@contracts/event-track";
export type {
  BriefDoc,
  BriefSection,
  BriefSlot,
  BriefStatus,
  BriefsResponse,
} from "@contracts/briefs";

export const MAG7_TICKERS = ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA"] as const;

export type ProductBriefCardState =
  | { kind: "placeholder" }
  | { kind: "writing" }
  | { kind: "ready"; brief: BriefDocContract }
  | { kind: "failed"; retrying: boolean; message?: string }
  | { kind: "not_applicable" }
  | { kind: "unavailable" }; // get-briefs 请求失败
