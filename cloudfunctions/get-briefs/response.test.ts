import { describe, expect, it } from "vitest";
import { toBriefDoc, toBriefsResponse } from "./response";
import type { BriefPersistenceDoc } from "./response";

const readyRow = {
  _id: "earnings-AAPL-20260803__earnings",
  eventId: "earnings-AAPL-20260803",
  eventKind: "earnings",
  slot: "earnings",
  year: 2026,
  title: "earnings brief",
  status: "ready",
  sections: [{ id: "summary", heading: "摘要", body: "公司维持全年指引。" }],
  disclaimer: "AI 生成 · 非正式官方文件",
  sourceFingerprint: "internal-fingerprint",
  sourceUrls: ["https://sec.example/filing"],
  model: "mock",
  promptVersion: "earnings-trader-v1",
  generatedAt: "2026-08-03T02:00:00.000Z",
  errorMessage: null,
  updatedAt: "2026-08-03T02:00:00.000Z",
  createdAt: "2026-08-03T02:00:00.000Z",
} satisfies BriefPersistenceDoc;

describe("get-briefs response mapper", () => {
  it("projects ready persistence rows to the public brief DTO", () => {
    expect(toBriefDoc(readyRow)).toEqual({
      eventId: "earnings-AAPL-20260803",
      slot: "earnings",
      status: "ready",
      sections: [{ id: "summary", heading: "摘要", body: "公司维持全年指引。" }],
      generatedAt: "2026-08-03T02:00:00.000Z",
      sourceUrls: ["https://sec.example/filing"],
      disclaimer: "AI 生成 · 非正式官方文件",
    });
  });

  it("normalizes null errorMessage and keeps failed public errors", () => {
    const failed = toBriefDoc({
      ...readyRow,
      status: "failed",
      sections: undefined,
      errorMessage: "source unavailable",
    });
    const notApplicable = toBriefDoc({
      ...readyRow,
      status: "not_applicable",
      errorMessage: null,
    });

    expect(failed).toEqual({
      eventId: "earnings-AAPL-20260803",
      slot: "earnings",
      status: "failed",
      generatedAt: "2026-08-03T02:00:00.000Z",
      sourceUrls: ["https://sec.example/filing"],
      disclaimer: "AI 生成 · 非正式官方文件",
      errorMessage: "source unavailable",
    });
    expect(notApplicable).not.toHaveProperty("errorMessage");
  });

  it("preserves the eventId envelope for empty and populated responses", () => {
    expect(toBriefsResponse("fomc-20260729", [])).toEqual({
      eventId: "fomc-20260729",
      briefs: [],
    });
    expect(toBriefsResponse("earnings-AAPL-20260803", [readyRow])).toMatchObject({
      eventId: "earnings-AAPL-20260803",
      briefs: [{ status: "ready" }],
    });
  });
});
