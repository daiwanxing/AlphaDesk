/** A 股交易分钟轴（09:30–11:30、13:00–15:00，含端点）。
 * 与前端 `src/shared/market/trading-axis.ts` 保持同一口径，改动需同步两侧。
 */

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function minuteRange(
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number,
): string[] {
  const labels: string[] = [];
  const endTotal = endHour * 60 + endMinute;

  for (let total = startHour * 60 + startMinute; total <= endTotal; total += 1) {
    labels.push(`${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`);
  }
  return labels;
}

/** 上午 / 下午两个连续交易时段，缺口判定按时段各自计算。 */
export const TRADING_SESSION_MINUTES: readonly (readonly string[])[] = [
  minuteRange(9, 30, 11, 30),
  minuteRange(13, 0, 15, 0),
];

export const TRADING_MINUTES: readonly string[] = TRADING_SESSION_MINUTES.flat();

export const EXPECTED_TRADING_MINUTE_COUNT = TRADING_MINUTES.length;

const TRADING_MINUTE_SET = new Set(TRADING_MINUTES);

export function isTradingMinute(t: string): boolean {
  return TRADING_MINUTE_SET.has(t);
}
