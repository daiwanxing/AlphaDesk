import { describe, expect, it } from "vitest";
import { amountParts, formatAmountYi, formatAmountYuan } from "../format";

describe("formatAmountYuan", () => {
  it("formats integer 亿 with grouping", () => {
    expect(formatAmountYuan(50_000_000_000)).toBe("500亿");
    expect(formatAmountYuan(123_456_789_000)).toBe("1,235亿");
    expect(formatAmountYuan(2_559_800_000_000)).toBe("25,598亿");
  });

  it("keeps 亿 above 万亿 scale", () => {
    expect(formatAmountYuan(1_500_000_000_000)).toBe("15,000亿");
    expect(formatAmountYuan(2_000_000_000_000)).toBe("20,000亿");
  });
});

describe("amountParts", () => {
  it("rounds to integer 亿", () => {
    expect(amountParts(2_560_000_000_000)).toEqual({ value: 25_600, suffix: "亿" });
    expect(amountParts(201_430_000_000)).toEqual({ value: 2_014, suffix: "亿" });
  });
});

describe("formatAmountYi", () => {
  it("formats axis ticks in 亿 with grouping", () => {
    expect(formatAmountYi(0)).toBe("0");
    expect(formatAmountYi(700_000_000_000)).toBe("7,000亿");
    expect(formatAmountYi(1_400_000_000_000)).toBe("14,000亿");
    expect(formatAmountYi(2_560_000_000_000)).toBe("25,600亿");
  });
});
