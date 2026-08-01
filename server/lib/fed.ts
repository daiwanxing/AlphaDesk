import { FED_BASE } from "./constants.ts";

export type FomcMaterialLink = {
  label: string;
  url: string;
  kind: "statement" | "minutes" | "sep" | "other";
};

export type FomcMeeting = {
  id: string;
  year: number;
  meetingLabel: string;
  meetingEndDate: string;
  status: "upcoming" | "held";
  sequenceInYear: number;
  hasMinutes: boolean;
  hasSep: boolean;
  materials: FomcMaterialLink[];
};

function fedUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${FED_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

function parseMeetingEndDateFromId(id: string): string {
  // monetary20260128a -> 2026-01-28
  const m = id.match(/(\d{4})(\d{2})(\d{2})/);
  if (!m) return id;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export async function fetchFomcMeetingsForYear(year: number): Promise<FomcMeeting[]> {
  const res = await fetch(`${FED_BASE}/monetarypolicy/fomccalendars.htm`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; InvestorEventTracker/0.1)" },
  });
  if (!res.ok) throw new Error(`Fed calendar failed: ${res.status}`);
  const html = await res.text();

  const start = html.indexOf(`${year} FOMC Meetings`);
  if (start < 0) return [];

  const nextYear = html.indexOf(`${year + 1} FOMC Meetings`, start);
  const chunk = html.slice(start, nextYear > 0 ? nextYear : start + 60_000);

  const statementIds = [...chunk.matchAll(/\/newsevents\/pressreleases\/monetary(\d{8})a\.htm/g)].map(
    (m) => m[1],
  );
  const minuteIds = new Set(
    [...chunk.matchAll(/\/monetarypolicy\/fomcminutes(\d{8})\.htm/g)].map((m) => m[1]),
  );
  const sepIds = new Set(
    [...chunk.matchAll(/\/monetarypolicy\/fomcprojtabl(\d{8})\.htm/g)].map((m) => m[1]),
  );

  const today = new Date().toISOString().slice(0, 10);
  const meetings: FomcMeeting[] = [];

  statementIds.forEach((id, index) => {
    const meetingEndDate = parseMeetingEndDateFromId(id);
    if (!meetingEndDate.startsWith(String(year))) return;

    const labelDate = new Date(meetingEndDate + "T12:00:00");
    const meetingLabel = labelDate.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const materials: FomcMaterialLink[] = [
      {
        label: "Statement (HTML)",
        url: fedUrl(`/newsevents/pressreleases/monetary${id}a.htm`),
        kind: "statement",
      },
      {
        label: "Statement (PDF)",
        url: fedUrl(`/monetarypolicy/files/monetary${id}a1.pdf`),
        kind: "statement",
      },
    ];

    if (minuteIds.has(id)) {
      materials.push(
        {
          label: "Minutes (HTML)",
          url: fedUrl(`/monetarypolicy/fomcminutes${id}.htm`),
          kind: "minutes",
        },
        {
          label: "Minutes (PDF)",
          url: fedUrl(`/monetarypolicy/fomcminutes${id}.pdf`),
          kind: "minutes",
        },
      );
    }

    if (sepIds.has(id)) {
      materials.push(
        {
          label: "Projection Materials / SEP (HTML)",
          url: fedUrl(`/monetarypolicy/fomcprojtabl${id}.htm`),
          kind: "sep",
        },
        {
          label: "Projection Materials / SEP (PDF)",
          url: fedUrl(`/monetarypolicy/fomcprojtabl${id}.pdf`),
          kind: "sep",
        },
      );
    }

    meetings.push({
      id: `fomc-${id}`,
      year,
      meetingLabel,
      meetingEndDate,
      status: meetingEndDate <= today ? "held" : "upcoming",
      sequenceInYear: index + 1,
      hasMinutes: minuteIds.has(id),
      hasSep: sepIds.has(id),
      materials,
    });
  });

  return meetings.sort((a, b) => a.meetingEndDate.localeCompare(b.meetingEndDate));
}
