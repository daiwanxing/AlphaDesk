import type { BriefDoc, EventDetailResponse, TimelineResponse } from "./types";

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

function eventsBase(): string {
  const base = import.meta.env.VITE_CLOUDBASE_EVENTS_URL as string | undefined;
  return base?.replace(/\/$/, "") ?? "";
}

function timelineListUrl(year: number): string {
  const base = eventsBase();
  if (base) return `${base}?year=${year}`;
  return `/api/events?year=${year}`;
}

function timelineDetailUrl(year: number, id: string): string {
  const base = eventsBase();
  const encoded = encodeURIComponent(id);
  if (base) return `${base}/${encoded}?year=${year}`;
  return `/api/events/${encoded}?year=${year}`;
}

export async function fetchTimeline(year: number): Promise<TimelineResponse> {
  const res = await fetch(timelineListUrl(year));
  return parseJson<TimelineResponse>(res);
}

export async function fetchEventDetail(
  year: number,
  id: string,
): Promise<EventDetailResponse> {
  const res = await fetch(timelineDetailUrl(year, id));
  return parseJson<EventDetailResponse>(res);
}

/** 无云 URL 时返回空列表，由状态合成显示占位/撰写中 */
export async function fetchBriefs(eventId: string): Promise<{ briefs: BriefDoc[] }> {
  const base = import.meta.env.VITE_CLOUDBASE_BRIEFS_URL as string | undefined;
  if (!base) {
    return { briefs: [] };
  }
  const url = `${base}?eventId=${encodeURIComponent(eventId)}`;
  const res = await fetch(url);
  return parseJson<{ briefs: BriefDoc[] }>(res);
}

/** 切历史年时点火 backfill；未配置则跳过，失败不影响时间线 */
export async function requestBriefBackfill(year: number): Promise<void> {
  const base = import.meta.env.VITE_CLOUDBASE_BACKFILL_URL as string | undefined;
  const key = import.meta.env.VITE_BRIEF_API_KEY as string | undefined;
  if (!base || !key) return;
  await fetch(base, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Brief-Api-Key": key,
    },
    body: JSON.stringify({ year }),
  });
}

export function eventSortDate(event: TimelineResponse["events"][number]): string {
  if (event.kind === "earnings") {
    return event.actualDate ?? event.scheduledDate ?? "9999-12-31";
  }
  return event.meetingEndDate;
}

export function eventDisplayDate(event: TimelineResponse["events"][number]): string {
  return eventSortDate(event);
}

export function formatDisplayDate(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? "T12:00:00" : ""));
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
