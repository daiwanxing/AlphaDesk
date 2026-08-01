export type EarningsEvent = {
  kind: "earnings";
  id: string;
  ticker: string;
  companyName: string;
  reportPeriodLabel: string;
  reportPeriodEnd?: string;
  scheduledDate?: string;
  actualDate?: string;
  status: "pending" | "disclosed";
  irUrl?: string;
  form?: string;
  cik?: string;
  accessionNumber?: string;
  edgarUrl?: string;
  time?: string;
  epsForecast?: string;
  sources: string[];
};

export type FomcEvent = {
  kind: "fomc";
  id: string;
  meetingLabel: string;
  meetingEndDate: string;
  status: "upcoming" | "held";
  sequenceInYear: number;
  materials: Array<{
    label: string;
    url: string;
    kind: "statement" | "minutes" | "sep" | "other";
    published: boolean;
  }>;
  sources: string[];
};

export type TimelineEvent = EarningsEvent | FomcEvent;

export type TimelineResponse = {
  year: number;
  updatedAt: string;
  events: TimelineEvent[];
  meta: {
    earningsDisclosed: number;
    earningsPending: number;
    fomc: number;
  };
};

export type EventDetailResponse = {
  year: number;
  updatedAt: string;
  event: TimelineEvent;
};

export const MAG7_TICKERS = ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA"] as const;

export type BriefSlot = "earnings" | "statement" | "minutes" | "sep";

export type BriefStatus =
  | "pending_material"
  | "queued"
  | "processing"
  | "ready"
  | "failed"
  | "failed_exhausted"
  | "not_applicable";

export type BriefSection = { id: string; heading: string; body: string };

export type BriefDoc = {
  eventId: string;
  slot: BriefSlot;
  status: BriefStatus;
  sections?: BriefSection[];
  generatedAt?: string;
  sourceUrls?: string[];
  disclaimer?: string;
  errorMessage?: string;
};

export type ProductBriefCardState =
  | { kind: "placeholder" }
  | { kind: "writing" }
  | { kind: "ready"; brief: BriefDoc }
  | { kind: "failed"; retrying: boolean; message?: string }
  | { kind: "not_applicable" }
  | { kind: "unavailable" }; // get-briefs 请求失败
