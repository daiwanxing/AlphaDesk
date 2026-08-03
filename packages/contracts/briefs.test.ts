import { describe, expect, it } from "vitest";
import type { BriefDoc, BriefSection, BriefSlot, BriefStatus, BriefsResponse } from "./briefs";

const sections = [
  { id: "summary", heading: "摘要", body: "公司维持全年指引。" },
] satisfies BriefSection[];

const readyBrief = {
  eventId: "earnings-AAPL-20260803",
  slot: "earnings",
  status: "ready",
  sections,
  generatedAt: "2026-08-03T02:00:00.000Z",
  sourceUrls: ["https://sec.example/filing"],
  disclaimer: "仅供研究参考",
} satisfies BriefDoc;

const response = {
  eventId: "earnings-AAPL-20260803",
  briefs: [readyBrief],
} satisfies BriefsResponse;

const slots: BriefSlot[] = ["earnings", "statement", "minutes", "sep"];
const statuses: BriefStatus[] = [
  "pending_material",
  "queued",
  "processing",
  "ready",
  "failed",
  "failed_exhausted",
  "not_applicable",
];

describe("brief contracts", () => {
  it("keeps the eventId response envelope and public sections", () => {
    expect(response).toMatchObject({
      eventId: "earnings-AAPL-20260803",
      briefs: [{ eventId: "earnings-AAPL-20260803", status: "ready" }],
    });
    expect(response.briefs[0]?.sections).toEqual(sections);
  });

  it("keeps slot and status unions explicit", () => {
    expect(slots).toHaveLength(4);
    expect(statuses).toHaveLength(7);
  });

  it("allows an empty brief response", () => {
    const emptyResponse = {
      eventId: "fomc-20260729",
      briefs: [],
    } satisfies BriefsResponse;

    expect(emptyResponse.briefs).toEqual([]);
  });
});
