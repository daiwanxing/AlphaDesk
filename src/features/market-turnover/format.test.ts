import { describe, expect, it } from "vitest";
import { formatAmountYuan, formatDelta } from "./format";

describe("formatAmountYuan", () => {
  it("formats amounts below 1 trillion in 亿", () => {
    expect(formatAmountYuan(50000000000)).toBe("500亿");
    expect(formatAmountYuan(123456789000)).toBe("1234.6亿");
  });

  it("formats amounts at or above 1 trillion in 万亿", () => {
    expect(formatAmountYuan(1500000000000)).toBe("1.5万亿");
    expect(formatAmountYuan(2000000000000)).toBe("2万亿");
  });
});

describe("formatDelta", () => {
  it("formats positive delta with sign", () => {
    expect(formatDelta(84000000000, 0.076)).toBe("+840亿 (+7.6%)");
  });

  it("formats negative delta with sign", () => {
    expect(formatDelta(-50000000000, -0.05)).toBe("-500亿 (-5.0%)");
  });

  it("formats zero delta", () => {
    expect(formatDelta(0, 0)).toBe("0 (+0.0%)");
  });

  it("uses neutral percent sign when pct is zero but delta is not", () => {
    expect(formatDelta(84000000000, 0)).toBe("+840亿 (+0.0%)");
  });
});
