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
