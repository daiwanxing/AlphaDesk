/**
 * 与 server/lib/detect-windows.ts 保持同步（改一处须改另一处）
 * AI 解读检测节奏（设计 §3.1.1）
 */

export type DetectMode = "dense" | "daily" | "idle" | "backfill";

export type FomcSlot = "statement" | "minutes" | "sep";

export type ActiveWindow = {
  eventId: string;
  slot: "earnings" | FomcSlot;
};

export type ResolveDetectModeInput = {
  today: string;
  activeWindows: ActiveWindow[];
  lastDailyAt: string | null;
  now: string;
  dailyIntervalHours: number;
};

function parseUtcDay(isoDate: string): number {
  const day = isoDate.slice(0, 10);
  return Date.parse(`${day}T12:00:00.000Z`);
}

function addDays(isoDate: string, days: number): string {
  const ms = parseUtcDay(isoDate) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function isOnOrBetween(today: string, start: string, end: string): boolean {
  const t = parseUtcDay(today);
  return t >= parseUtcDay(start) && t <= parseUtcDay(end);
}

/** 财报加密窗：锚点日前 1 天～结束锚点后 3 天（优先 scheduled 起、actual 止） */
export function isInEarningsWindow(
  today: string,
  dates: { scheduledDate?: string; actualDate?: string },
): boolean {
  const startAnchor = dates.scheduledDate ?? dates.actualDate;
  const endAnchor = dates.actualDate ?? dates.scheduledDate;
  if (!startAnchor || !endAnchor) return false;
  return isOnOrBetween(today, addDays(startAnchor, -1), addDays(endAnchor, 3));
}

/** FOMC 各槽位相对会议结束日的窗口 */
export function isInFomcSlotWindow(today: string, meetingEndDate: string, slot: FomcSlot): boolean {
  if (slot === "minutes") {
    return isOnOrBetween(today, addDays(meetingEndDate, 14), addDays(meetingEndDate, 28));
  }
  return isOnOrBetween(today, addDays(meetingEndDate, -1), addDays(meetingEndDate, 3));
}

export function resolveDetectMode(input: ResolveDetectModeInput): "dense" | "daily" | "idle" {
  if (input.activeWindows.length > 0) return "dense";

  if (!input.lastDailyAt) return "daily";

  const elapsedMs = Date.parse(input.now) - Date.parse(input.lastDailyAt);
  const intervalMs = input.dailyIntervalHours * 3_600_000;
  if (elapsedMs >= intervalMs) return "daily";

  return "idle";
}
