import type { TurnoverPoint } from "@contracts/market-turnover";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatMinute(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}

function pushMinuteRange(
  labels: string[],
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number,
): void {
  let hour = startHour;
  let minute = startMinute;
  const endTotal = endHour * 60 + endMinute;

  while (hour * 60 + minute <= endTotal) {
    labels.push(formatMinute(hour, minute));
    minute += 1;
    if (minute >= 60) {
      hour += 1;
      minute = 0;
    }
  }
}

/** Ordinal axis labels for A-share trading minutes (09:30–11:30, 13:00–15:00). */
export function buildTradingMinuteLabels(): string[] {
  const labels: string[] = [];
  pushMinuteRange(labels, 9, 30, 11, 30);
  pushMinuteRange(labels, 13, 0, 15, 0);
  return labels;
}

/** Align sparse series to a fixed minute axis.
 * Cumulative amounts: bridge internal gaps with last value (avoids lunch 11:30|13:00 断点白缝);
 * do not extend past the last observed point (keeps intraday future minutes empty).
 */
export function alignSeriesToAxis(axis: string[], points: TurnoverPoint[]): (number | null)[] {
  const byTime = new Map(points.map((point) => [point.t, point.v]));
  const lastObserved = points[points.length - 1]?.t;
  let last: number | null = null;

  return axis.map((t) => {
    const value = byTime.get(t);
    if (value !== undefined) {
      last = value;
      return value;
    }
    if (last != null && lastObserved && t <= lastObserved) {
      return last;
    }
    return null;
  });
}
