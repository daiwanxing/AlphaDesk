import { buildTimeline, findEvent } from "./timeline.ts";

const CACHE_CONTROL = "public, s-maxage=1800, stale-while-revalidate=3600";

export function parseYearParam(raw: unknown): number | null {
  const y = Number(Array.isArray(raw) ? raw[0] : raw ?? new Date().getFullYear());
  if (!Number.isInteger(y) || y < 2020 || y > 2030) return null;
  return y;
}

export async function getEventsTimeline(year: number) {
  return buildTimeline(year);
}

export async function getEventDetail(year: number, id: string) {
  const timeline = await buildTimeline(year);
  const event = findEvent(timeline, id);
  if (!event) return null;
  return { year, updatedAt: timeline.updatedAt, event };
}

export function cacheHeaders(): Record<string, string> {
  return { "Cache-Control": CACHE_CONTROL };
}
