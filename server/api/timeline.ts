import { getCached, setCache } from "../lib/cache.ts";
import { getIrUrl } from "../lib/constants.ts";
import { fetchFomcMeetingsForYear } from "../lib/fed.ts";
import { fetchMag7UpcomingForYear } from "../lib/nasdaq.ts";
import { fetchMag7FilingsForYear } from "../lib/sec.ts";

export type EarningsEvent = {
  kind: "earnings";
  id: string;
  ticker: string;
  companyName: string;
  reportPeriodLabel: string;
  reportPeriodEnd?: string;
  scheduledDate?: string;
  actualDate?: string;
  status: "pending" | "disclosed";
  irUrl?: string;
  form?: string;
  cik?: string;
  accessionNumber?: string;
  edgarUrl?: string;
  time?: string;
  epsForecast?: string;
  sources: string[];
};

export type FomcEvent = {
  kind: "fomc";
  id: string;
  meetingLabel: string;
  meetingEndDate: string;
  status: "upcoming" | "held";
  sequenceInYear: number;
  materials: Array<{
    label: string;
    url: string;
    kind: "statement" | "minutes" | "sep" | "other";
    published: boolean;
  }>;
  sources: string[];
};

export type TimelineEvent = EarningsEvent | FomcEvent;

function fiscalLabel(fiscalQuarterEnding: string): string {
  // "Jun/2026" from Nasdaq
  const [mon, yr] = fiscalQuarterEnding.split("/");
  if (!mon || !yr) return fiscalQuarterEnding;
  return `FY${yr} (${mon})`;
}

function reportPeriodLabelFromSec(form: string, reportDate: string): string {
  if (!reportDate) return form;
  const d = new Date(reportDate + "T12:00:00");
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  if (form === "10-K") return `FY${y} 年报 (10-K)`;
  const q = Math.ceil(m / 3);
  return `FY${y} Q${q} (${form})`;
}

export async function buildTimeline(year: number): Promise<{
  year: number;
  updatedAt: string;
  events: TimelineEvent[];
  meta: { earningsDisclosed: number; earningsPending: number; fomc: number };
}> {
  const cacheKey = `timeline-${year}`;
  const cached = getCached<Awaited<ReturnType<typeof buildTimeline>>>(cacheKey);
  if (cached) return cached;

  const [secFilings, nasdaqUpcoming, fomcMeetings] = await Promise.all([
    fetchMag7FilingsForYear(year),
    fetchMag7UpcomingForYear(year),
    fetchFomcMeetingsForYear(year),
  ]);

  const disclosedKeys = new Set(
    secFilings.map((f) => `${f.ticker}-${f.reportDate}-${f.form}`),
  );

  const earningsEvents: EarningsEvent[] = secFilings.map((f) => ({
    kind: "earnings",
    id: `earnings-${f.ticker}-${f.accessionNumber.replace(/-/g, "")}`,
    ticker: f.ticker,
    companyName: f.companyName,
    reportPeriodLabel: reportPeriodLabelFromSec(f.form, f.reportDate),
    reportPeriodEnd: f.reportDate || undefined,
    actualDate: f.filingDate,
    status: "disclosed",
    irUrl: getIrUrl(f.ticker),
    form: f.form,
    cik: f.cik,
    accessionNumber: f.accessionNumber,
    edgarUrl: f.edgarUrl,
    sources: ["公司 IR 官网", "SEC EDGAR"],
  }));

  for (const u of nasdaqUpcoming) {
    if (!u.scheduledDate.startsWith(String(year))) continue;
    const pendingId = `earnings-pending-${u.ticker}-${u.scheduledDate.replace(/-/g, "")}`;
    const alreadyDisclosed = earningsEvents.some(
      (e) =>
        e.ticker === u.ticker &&
        e.status === "disclosed" &&
        e.actualDate &&
        Math.abs(
          new Date(e.actualDate).getTime() - new Date(u.scheduledDate).getTime(),
        ) <
          14 * 86400000,
    );
    if (alreadyDisclosed) continue;

    earningsEvents.push({
      kind: "earnings",
      id: pendingId,
      ticker: u.ticker,
      companyName: u.companyName,
      reportPeriodLabel: fiscalLabel(u.fiscalQuarterEnding),
      scheduledDate: u.scheduledDate,
      status: "pending",
      irUrl: getIrUrl(u.ticker),
      time: u.time,
      epsForecast: u.epsForecast,
      sources: [u.source, "公司 IR 官网"],
    });
    disclosedKeys.add(`${u.ticker}-pending-${u.scheduledDate}`);
  }

  const fomcEvents: FomcEvent[] = fomcMeetings.map((m) => ({
    kind: "fomc",
    id: m.id,
    meetingLabel: m.meetingLabel,
    meetingEndDate: m.meetingEndDate,
    status: m.status,
    sequenceInYear: m.sequenceInYear,
    materials: m.materials.map((mat) => ({
      ...mat,
      published:
        mat.kind === "statement"
          ? m.status === "held"
          : mat.kind === "minutes"
            ? m.hasMinutes
            : mat.kind === "sep"
              ? m.hasSep
              : false,
    })),
    sources: ["Federal Reserve"],
  }));

  const events: TimelineEvent[] = [...earningsEvents, ...fomcEvents].sort((a, b) => {
    const dateA =
      a.kind === "earnings"
        ? a.actualDate ?? a.scheduledDate ?? "9999"
        : a.meetingEndDate;
    const dateB =
      b.kind === "earnings"
        ? b.actualDate ?? b.scheduledDate ?? "9999"
        : b.meetingEndDate;
    return dateA.localeCompare(dateB);
  });

  const result = {
    year,
    updatedAt: new Date().toISOString(),
    events,
    meta: {
      earningsDisclosed: earningsEvents.filter((e) => e.status === "disclosed").length,
      earningsPending: earningsEvents.filter((e) => e.status === "pending").length,
      fomc: fomcEvents.length,
    },
  };

  setCache(cacheKey, result, 30 * 60 * 1000);
  return result;
}

export function findEvent(
  timeline: Awaited<ReturnType<typeof buildTimeline>>,
  id: string,
): TimelineEvent | undefined {
  return timeline.events.find((e) => e.id === id);
}
