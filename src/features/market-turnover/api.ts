import type { MarketTurnoverResponse } from "./types";

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
  const base = import.meta.env.VITE_CLOUDBASE_TURNOVER_URL as string | undefined;
  if (!base) {
    throw new Error("VITE_CLOUDBASE_TURNOVER_URL is not set");
  }
  const res = await fetch(base, { signal: options?.signal });
  return parseJson<MarketTurnoverResponse>(res);
}
