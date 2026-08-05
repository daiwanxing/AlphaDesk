export type MinutePoint = {
  t: string;
  v: number;
};

function minuteRange(start: number, end: number): string[] {
  return Array.from({ length: end - start + 1 }, (_, index) => {
    const total = start + index;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  });
}

/** A-share ordinal trading axis: 09:30–11:30 and 13:00–15:00. */
export const A_SHARE_TRADING_MINUTES = [
  ...minuteRange(9 * 60 + 30, 11 * 60 + 30),
  ...minuteRange(13 * 60, 15 * 60),
];

/** Bridge internal gaps with the last cumulative value, but leave future minutes empty. */
export function alignSeriesToAxis(
  axis: readonly string[],
  points: readonly MinutePoint[],
): (number | null)[] {
  const byTime = new Map(points.map((point) => [point.t, point.v]));
  const lastObserved = points[points.length - 1]?.t;
  let last: number | null = null;

  return axis.map((t) => {
    const value = byTime.get(t);
    if (value !== undefined) {
      last = value;
      return value;
    }
    return last != null && lastObserved && t <= lastObserved ? last : null;
  });
}
