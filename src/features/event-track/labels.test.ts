import { describe, expect, it } from "vitest";
import { formatEarningsTitle, formatFomcTitleFromDate, formatRelativeDay } from "./labels";

describe("formatEarningsTitle", () => {
  it("light-chinesifies FY and lifts SEC form to chip", () => {
    expect(formatEarningsTitle("FY2026 Q2 (10-Q)")).toEqual({
      title: "2026财年 Q2",
      formChip: "10-Q",
    });
  });

  it("uses explicit form field when label has none", () => {
    expect(formatEarningsTitle("FY2025 Q1", "10-Q")).toEqual({
      title: "2025财年 Q1",
      formChip: "10-Q",
    });
  });

  it("maps month abbreviations", () => {
    expect(formatEarningsTitle("FY2026 (Mar)")).toEqual({
      title: "2026财年（3月）",
      formChip: undefined,
    });
  });
});

describe("formatFomcTitleFromDate", () => {
  it("builds Chinese meeting title from ISO date", () => {
    expect(formatFomcTitleFromDate("2026-01-20")).toBe("2026年1月会议");
  });
});

describe("formatRelativeDay", () => {
  it("labels today / tomorrow / past offsets", () => {
    expect(formatRelativeDay("2026-08-02", "2026-08-02")).toBe("今天");
    expect(formatRelativeDay("2026-08-03", "2026-08-02")).toBe("明天");
    expect(formatRelativeDay("2026-07-30", "2026-08-02")).toBe("3天前");
  });
});
