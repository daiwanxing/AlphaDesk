import { describe, expect, it } from "vitest";
import type {
  EventDetailResponse,
  FomcEvent,
  EarningsEvent,
  TimelineResponse,
} from "./event-track";

const earnings = {
  kind: "earnings",
  id: "earnings-pending-AAPL-20260803",
  ticker: "AAPL",
  companyName: "Apple",
  reportPeriodLabel: "FY2026 (Jun)",
  scheduledDate: "2026-08-03",
  status: "pending",
  irUrl: "https://investor.example/aapl",
  sources: ["Nasdaq", "公司 IR 官网"],
} satisfies EarningsEvent;

const fomc = {
  kind: "fomc",
  id: "fomc-20260729",
  meetingLabel: "July 2026",
  meetingEndDate: "2026-07-29",
  status: "held",
  sequenceInYear: 5,
  materials: [
    {
      label: "Statement",
      url: "https://federalreserve.example/statement",
      kind: "statement",
      published: true,
    },
  ],
  sources: ["Federal Reserve"],
} satisfies FomcEvent;

const timeline = {
  year: 2026,
  updatedAt: "2026-08-03T01:00:00.000Z",
  events: [earnings, fomc],
  meta: {
    earningsDisclosed: 0,
    earningsPending: 1,
    fomc: 1,
  },
} satisfies TimelineResponse;

const detail = {
  year: 2026,
  updatedAt: timeline.updatedAt,
  event: earnings,
} satisfies EventDetailResponse;

describe("event-track contracts", () => {
  it("supports earnings optional fields and mixed timeline events", () => {
    expect(timeline.events).toHaveLength(2);
    expect(timeline.events[0]).toMatchObject({ kind: "earnings", scheduledDate: "2026-08-03" });
    expect(detail.event.kind).toBe("earnings");
  });

  it("keeps FOMC material status and kind explicit", () => {
    expect(fomc.materials[0]).toMatchObject({ kind: "statement", published: true });
  });
});
