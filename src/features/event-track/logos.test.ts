import { describe, expect, it } from "vitest";
import { logoUrlForTicker, fallbackInitials, THESVG_REF } from "./logos";

describe("logos", () => {
  it("uses colored theSVG CDN for MAG7 (Apple via Wikimedia)", () => {
    expect(THESVG_REF).toBe("v2.0.0");
    expect(logoUrlForTicker("AAPL")).toBe("https://cdn.simpleicons.org/apple/121111");
    expect(logoUrlForTicker("NVDA")).toBe("https://cdn.simpleicons.org/nvidia/76B900");
    expect(logoUrlForTicker("MSFT")).toContain("/microsoft/default.svg");
  });

  it("returns null for unknown ticker", () => {
    expect(logoUrlForTicker("ZZZZ")).toBeNull();
  });

  it("builds fallback initials", () => {
    expect(fallbackInitials("AAPL")).toBe("AA");
    expect(fallbackInitials("FOMC")).toBe("FO");
  });
});
