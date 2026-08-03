import type { EventDetailResponse, TimelineResponse } from "@contracts/event-track";
import { CLOUDBASE_PATHS, cloudbaseUrl } from "@/shared/config/cloudbase";
import { parseJson } from "./http";

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
