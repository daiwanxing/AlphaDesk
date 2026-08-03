import { describe, expect, it } from "vitest";
import { resolveMarketSession } from "../session";

/** Fixed Beijing wall-clock instant (independent of host TZ). */
function beijing(y: number, m: number, d: number, h: number, min = 0): Date {
  return new Date(
    `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00+08:00`,
  );
}

const weekday = (h: number, min = 0) => beijing(2026, 8, 4, h, min);

describe("resolveMarketSession", () => {
  it("returns continuous on a weekday during morning session", () => {
    expect(resolveMarketSession(weekday(10, 0))).toBe("continuous");
  });

  it("returns lunch on a weekday during midday break", () => {
    expect(resolveMarketSession(weekday(12, 0))).toBe("lunch");
  });

  it("returns closed on a weekday after market close", () => {
    expect(resolveMarketSession(weekday(16, 0))).toBe("closed");
  });

  it("returns weekend on Saturday and Sunday", () => {
    expect(resolveMarketSession(beijing(2026, 8, 1, 10, 0))).toBe("weekend");
    expect(resolveMarketSession(beijing(2026, 8, 2, 10, 0))).toBe("weekend");
  });

  it("returns pre_open before the morning open", () => {
    expect(resolveMarketSession(weekday(9, 0))).toBe("pre_open");
    expect(resolveMarketSession(weekday(9, 29))).toBe("pre_open");
  });

  it("transitions at session boundaries", () => {
    expect(resolveMarketSession(weekday(9, 30))).toBe("continuous");
    expect(resolveMarketSession(weekday(11, 29))).toBe("continuous");
    expect(resolveMarketSession(weekday(11, 30))).toBe("lunch");
    expect(resolveMarketSession(weekday(12, 59))).toBe("lunch");
    expect(resolveMarketSession(weekday(13, 0))).toBe("continuous");
    expect(resolveMarketSession(weekday(14, 59))).toBe("continuous");
    expect(resolveMarketSession(weekday(15, 0))).toBe("closed");
  });
});
