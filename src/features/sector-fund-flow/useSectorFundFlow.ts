import { useCallback, useEffect, useRef, useState } from "react";
import type { MarketSession } from "@contracts/market-turnover";
import type { SectorFundFlowResponse, SectorFundFlowSeries } from "@contracts/sector-fund-flow";
import { fetchSectorFundFlow } from "@/services/sector-fund-flow";
import { cloudbaseApiBase } from "@/shared/config/cloudbase";
import { sectorFundFlowEqual } from "./equal";

const POLL_BASE_MS = 15_000;
/** Stagger vs turnover's 15s poll so both CF calls don't spike together. */
const POLL_STAGGER_MS = 5_000;
const BACKOFF_MS = [30_000, 60_000] as const;

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

export type UseSectorFundFlowResult = {
  sectors: SectorFundFlowSeries[];
  error: string | null;
  loading: boolean;
};

export function useSectorFundFlow(session: MarketSession): UseSectorFundFlowResult {
  const [data, setData] = useState<SectorFundFlowResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const dataRef = useRef(data);
  const backoffRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const loadGenRef = useRef(0);
  const sessionRef = useRef(session);
  const prevSessionRef = useRef(session);
  const mountedRef = useRef(true);
  const firstPollRef = useRef(true);

  dataRef.current = data;
  sessionRef.current = session;

  const clearPollTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const nextPollDelay = useCallback((): number => {
    if (backoffRef.current === 0) {
      if (firstPollRef.current) {
        firstPollRef.current = false;
        return POLL_BASE_MS + POLL_STAGGER_MS;
      }
      return POLL_BASE_MS;
    }
    return BACKOFF_MS[Math.min(backoffRef.current - 1, BACKOFF_MS.length - 1)];
  }, []);

  const load = useCallback(async (): Promise<void> => {
    if (!cloudbaseApiBase()) {
      setError(null);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const generation = ++loadGenRef.current;

    if (dataRef.current === null) setLoading(true);

    try {
      const res = await fetchSectorFundFlow({ signal: controller.signal });
      if (!mountedRef.current || generation !== loadGenRef.current) return;
      if (!res.ok) {
        setError(res.error ?? "板块资金数据不可用");
        backoffRef.current = Math.min(backoffRef.current + 1, BACKOFF_MS.length);
        return;
      }
      if (!sectorFundFlowEqual(dataRef.current, res)) {
        setData(res);
      }
      setError(null);
      backoffRef.current = 0;
    } catch (err) {
      if (!mountedRef.current || generation !== loadGenRef.current) return;
      if (isAbortError(err)) return;
      setError(err instanceof Error ? err.message : "请求失败");
      backoffRef.current = Math.min(backoffRef.current + 1, BACKOFF_MS.length);
    } finally {
      if (mountedRef.current && generation === loadGenRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const schedulePoll = useCallback(() => {
    clearPollTimer();
    if (sessionRef.current !== "continuous") return;
    timerRef.current = setTimeout(async () => {
      if (!mountedRef.current) return;
      await load();
      if (mountedRef.current && sessionRef.current === "continuous") {
        schedulePoll();
      }
    }, nextPollDelay());
  }, [clearPollTimer, load, nextPollDelay]);

  useEffect(() => {
    mountedRef.current = true;
    void load();

    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      clearPollTimer();
    };
  }, [clearPollTimer, load]);

  useEffect(() => {
    const previousSession = prevSessionRef.current;
    prevSessionRef.current = session;
    clearPollTimer();

    if (session === "continuous") {
      schedulePoll();
    } else {
      firstPollRef.current = true;
      if (previousSession === "continuous" && (session === "lunch" || session === "closed")) {
        void load();
      }
    }
  }, [clearPollTimer, load, schedulePoll, session]);

  return { sectors: data?.sectors ?? [], error, loading };
}
