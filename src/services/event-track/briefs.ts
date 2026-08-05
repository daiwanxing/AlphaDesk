import type { BriefsResponse } from "@contracts/briefs";
import { CLOUDBASE_PATHS, cloudbaseUrl } from "@/shared/config/cloudbase";
import { parseJson } from "../http";

export type { BriefsResponse } from "@contracts/briefs";

export async function fetchBriefs(eventId: string): Promise<BriefsResponse> {
  const base = cloudbaseUrl(CLOUDBASE_PATHS.briefs);
  if (!base) {
    return { eventId, briefs: [] };
  }
  const url = `${base}?eventId=${encodeURIComponent(eventId)}`;
  const res = await fetch(url);
  return parseJson<BriefsResponse>(res);
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
