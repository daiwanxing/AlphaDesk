import type { BriefDoc, EventDetailResponse, TimelineResponse } from "./types";
import { CLOUDBASE_PATHS, cloudbaseUrl } from "@/shared/config/cloudbase";

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

function eventsBase(): string {
  return cloudbaseUrl(CLOUDBASE_PATHS.events) ?? "";
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

export async function fetchEventDetail(year: number, id: string): Promise<EventDetailResponse> {
  const res = await fetch(timelineDetailUrl(year, id));
  return parseJson<EventDetailResponse>(res);
}

/** 无云 URL 时返回空列表，由状态合成显示占位/撰写中 */
export async function fetchBriefs(eventId: string): Promise<{ briefs: BriefDoc[] }> {
  const base = cloudbaseUrl(CLOUDBASE_PATHS.briefs);
  if (!base) {
    return { briefs: [] };
  }
  const url = `${base}?eventId=${encodeURIComponent(eventId)}`;
  const res = await fetch(url);
  return parseJson<{ briefs: BriefDoc[] }>(res);
}

/** 切历史年时点火 backfill；未配置则跳过，失败不影响时间线 */
export async function requestBriefBackfill(year: number): Promise<void> {
  const base = cloudbaseUrl(CLOUDBASE_PATHS.backfill);
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

export function eventDisplayDate(event: TimelineResponse["events"][number]): string {
  if (event.kind === "earnings") {
    return event.actualDate ?? event.scheduledDate ?? "9999-12-31";
  }
  return event.meetingEndDate;
}

export function formatDisplayDate(iso: string): string {
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
