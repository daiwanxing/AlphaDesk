import { describe, expect, it } from "vitest";
import { deriveHasSep, mergeBriefCards, resolveBriefCardState, slotsForEvent } from "./briefs";
import type { BriefDoc, EarningsEvent, FomcEvent } from "./types";

const earningsPending: EarningsEvent = {
  kind: "earnings",
  id: "earnings-pending-AAPL-20260129",
  ticker: "AAPL",
  companyName: "Apple",
  reportPeriodLabel: "FY2026 (Mar)",
  scheduledDate: "2026-01-29",
  status: "pending",
  sources: ["Nasdaq"],
};

const earningsDisclosed: EarningsEvent = {
  kind: "earnings",
  id: "earnings-AAPL-abc",
  ticker: "AAPL",
  companyName: "Apple",
  reportPeriodLabel: "FY2025 Q1",
  actualDate: "2026-01-30",
  status: "disclosed",
  sources: ["SEC EDGAR"],
};

function fomc(partial: Partial<FomcEvent> & Pick<FomcEvent, "materials" | "status">): FomcEvent {
  return {
    kind: "fomc",
    id: "fomc-20260120",
    meetingLabel: "January 2026",
    meetingEndDate: "2026-01-20",
    sequenceInYear: 1,
    sources: ["Federal Reserve"],
    ...partial,
  };
}

describe("slotsForEvent", () => {
  it("returns earnings vs fomc slots", () => {
    expect(slotsForEvent("earnings")).toEqual(["earnings"]);
    expect(slotsForEvent("fomc")).toEqual(["statement", "minutes", "sep"]);
  });
});

describe("resolveBriefCardState", () => {
  it("placeholder when material not published even if brief exists", () => {
    const brief: BriefDoc = {
      eventId: "x",
      slot: "earnings",
      status: "ready",
      sections: [],
    };
    expect(
      resolveBriefCardState({
        slot: "earnings",
        brief,
        materialPublished: false,
      }),
    ).toEqual({ kind: "placeholder" });
  });

  it("writing when material published and no brief", () => {
    expect(
      resolveBriefCardState({
        slot: "earnings",
        brief: undefined,
        materialPublished: true,
      }),
    ).toEqual({ kind: "writing" });
  });

  it("maps ready / failed / failed_exhausted / not_applicable", () => {
    const base = { slot: "earnings" as const, materialPublished: true };
    expect(
      resolveBriefCardState({
        ...base,
        brief: { eventId: "x", slot: "earnings", status: "ready" },
      }).kind,
    ).toBe("ready");
    expect(
      resolveBriefCardState({
        ...base,
        brief: { eventId: "x", slot: "earnings", status: "failed" },
      }),
    ).toMatchObject({ kind: "failed", retrying: true });
    expect(
      resolveBriefCardState({
        ...base,
        brief: { eventId: "x", slot: "earnings", status: "failed_exhausted" },
      }),
    ).toMatchObject({ kind: "failed", retrying: false });
    expect(
      resolveBriefCardState({
        slot: "sep",
        brief: undefined,
        materialPublished: false,
        hasSep: false,
      }),
    ).toEqual({ kind: "not_applicable" });
  });
});

describe("mergeBriefCards", () => {
  it("pending earnings → placeholder", () => {
    const cards = mergeBriefCards(earningsPending, []);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.state).toEqual({ kind: "placeholder" });
  });

  it("disclosed earnings with no brief → writing", () => {
    const cards = mergeBriefCards(earningsDisclosed, []);
    expect(cards[0]?.state).toEqual({ kind: "writing" });
  });

  it("always expands three FOMC slots", () => {
    const event = fomc({
      status: "held",
      materials: [
        { label: "Statement", url: "https://fed.example/s", kind: "statement", published: true },
        { label: "Minutes", url: "https://fed.example/m", kind: "minutes", published: false },
      ],
    });
    const cards = mergeBriefCards(event, []);
    expect(cards.map((c) => c.slot)).toEqual(["statement", "minutes", "sep"]);
    expect(cards.find((c) => c.slot === "statement")?.state).toEqual({ kind: "writing" });
    expect(cards.find((c) => c.slot === "minutes")?.state).toEqual({ kind: "placeholder" });
    expect(cards.find((c) => c.slot === "sep")?.state).toEqual({ kind: "not_applicable" });
  });

  it("deriveHasSep: held without sep entries → false", () => {
    const event = fomc({
      status: "held",
      materials: [
        { label: "Statement", url: "https://fed.example/s", kind: "statement", published: true },
      ],
    });
    expect(deriveHasSep(event)).toBe(false);
  });

  it("briefs fetch failure → unavailable for all slots", () => {
    const cards = mergeBriefCards(earningsDisclosed, [], { briefsFetchFailed: true });
    expect(cards.every((c) => c.state.kind === "unavailable")).toBe(true);
  });
});
