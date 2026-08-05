import { describe, expect, it } from "vitest";
import { formatNetInflowYi, formatNetInflowYiAxis } from "../format";

describe("sector fund flow format", () => {
  it("formats signed yi with two decimals", () => {
    expect(formatNetInflowYi(318.291)).toBe("+318.29亿");
    expect(formatNetInflowYi(-17.612)).toBe("−17.61亿");
    expect(formatNetInflowYi(0)).toBe("0.00亿");
  });

  it("formats axis labels without forced trailing decimals", () => {
    expect(formatNetInflowYiAxis(0)).toBe("0");
    expect(formatNetInflowYiAxis(100)).toBe("100亿");
    expect(formatNetInflowYiAxis(12.5)).toBe("12.5亿");
  });
});
