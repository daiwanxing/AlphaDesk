import type { MarketTurnoverResponse } from "@contracts/market-turnover";
import { CLOUDBASE_PATHS, cloudbaseUrl } from "@/shared/config/cloudbase";

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function fetchMarketTurnover(options?: {
  signal?: AbortSignal;
}): Promise<MarketTurnoverResponse> {
  const url = cloudbaseUrl(CLOUDBASE_PATHS.turnover);
  if (!url) {
    throw new Error("VITE_CLOUDBASE_API_BASE is not set");
  }
  const res = await fetch(url, { signal: options?.signal });
  const data = await parseJson<MarketTurnoverResponse>(res);
  return data;
}
