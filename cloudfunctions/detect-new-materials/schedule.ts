import { getIrUrl } from "./constants";
import { fetchFomcMeetingsForYear } from "./fed";
import { fetchNearTermMag7Upcoming } from "./nasdaq";
import { fetchMag7FilingsForYear } from "./sec";
import type { ActiveWindow, FomcSlot } from "./detect-windows";
import { isInEarningsWindow, isInFomcSlotWindow } from "./detect-windows";

export type SlimEarnings = {
  kind: "earnings";
  id: string;
  ticker: string;
  companyName: string;
  status: "pending" | "disclosed";
  scheduledDate?: string;
  actualDate?: string;
  accessionNumber?: string;
  edgarUrl?: string;
  irUrl?: string;
  year: number;
};

export type SlimFomc = {
  kind: "fomc";
  id: string;
  meetingEndDate: string;
  status: "upcoming" | "held";
  hasSep: boolean;
  year: number;
  materials: Array<{
    kind: "statement" | "minutes" | "sep" | "other";
    url: string;
    published: boolean;
  }>;
};

export type SlimEvent = SlimEarnings | SlimFomc;

export type ScheduleSnapshot = {
  year: number;
  fetchedAt: string;
  events: SlimEvent[];
};

function reportOk() {
  /* noop helper for typing */
}

/** 拉取当年已披露财报 + FOMC + 近端待披露（窗口用） */
export async function fetchSchedule(year: number): Promise<ScheduleSnapshot> {
  reportOk();
  const [filings, fomcMeetings, upcoming] = await Promise.all([
    fetchMag7FilingsForYear(year),
    fetchFomcMeetingsForYear(year),
    year === new Date().getFullYear()
      ? fetchNearTermMag7Upcoming({ daysBack: 5, daysForward: 14 })
      : Promise.resolve([]),
  ]);

  const earnings: SlimEarnings[] = filings.map((f) => ({
    kind: "earnings",
    id: `earnings-${f.ticker}-${f.accessionNumber.replace(/-/g, "")}`,
    ticker: f.ticker,
    companyName: f.companyName,
    status: "disclosed",
    actualDate: f.filingDate,
    accessionNumber: f.accessionNumber,
    edgarUrl: f.edgarUrl,
    irUrl: getIrUrl(f.ticker),
    year,
  }));

  for (const u of upcoming) {
    if (!u.scheduledDate.startsWith(String(year))) continue;
    const already = earnings.some(
      (e) =>
        e.ticker === u.ticker &&
        e.actualDate &&
        Math.abs(Date.parse(e.actualDate) - Date.parse(u.scheduledDate)) < 14 * 86400000,
    );
    if (already) continue;
    earnings.push({
      kind: "earnings",
      id: `earnings-pending-${u.ticker}-${u.scheduledDate.replace(/-/g, "")}`,
      ticker: u.ticker,
      companyName: u.companyName,
      status: "pending",
      scheduledDate: u.scheduledDate,
      irUrl: getIrUrl(u.ticker),
      year,
    });
  }

  const fomc: SlimFomc[] = fomcMeetings.map((m) => ({
    kind: "fomc",
    id: m.id,
    meetingEndDate: m.meetingEndDate,
    status: m.status,
    hasSep: m.hasSep,
    year,
    materials: m.materials.map((mat) => ({
      kind: mat.kind,
      url: mat.url,
      published:
        mat.kind === "statement"
          ? m.status === "held"
          : mat.kind === "minutes"
            ? m.hasMinutes
            : mat.kind === "sep"
              ? m.hasSep
              : false,
    })),
  }));

  return {
    year,
    fetchedAt: new Date().toISOString(),
    events: [...earnings, ...fomc],
  };
}

export type BriefRow = {
  _id?: string;
  eventId: string;
  slot: string;
  status?: string;
  sourceFingerprint?: string;
};

/** 仍需检测的活跃窗口（已 ready / not_applicable 的槽位不计入） */
export function computeActiveWindows(
  today: string,
  events: SlimEvent[],
  briefs: BriefRow[],
): ActiveWindow[] {
  const briefKey = new Map(
    briefs.map((b) => [`${b.eventId}__${b.slot}`, b] as const),
  );
  const windows: ActiveWindow[] = [];

  for (const ev of events) {
    if (ev.kind === "earnings") {
      if (ev.id.startsWith("earnings-pending-")) {
        if (isInEarningsWindow(today, { scheduledDate: ev.scheduledDate })) {
          windows.push({ eventId: ev.id, slot: "earnings" });
        }
        continue;
      }
      const b = briefKey.get(`${ev.id}__earnings`);
      if (b?.status === "ready") continue;
      if (
        isInEarningsWindow(today, {
          scheduledDate: ev.scheduledDate,
          actualDate: ev.actualDate,
        })
      ) {
        windows.push({ eventId: ev.id, slot: "earnings" });
      }
      continue;
    }

    const slots: FomcSlot[] = ["statement", "minutes", "sep"];
    for (const slot of slots) {
      if (slot === "sep" && !ev.hasSep) continue;
      const b = briefKey.get(`${ev.id}__${slot}`);
      if (b?.status === "ready" || b?.status === "not_applicable") continue;
      if (isInFomcSlotWindow(today, ev.meetingEndDate, slot)) {
        windows.push({ eventId: ev.id, slot });
      }
    }
  }

  return windows;
}
