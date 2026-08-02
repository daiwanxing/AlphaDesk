import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchMarketTurnover } from "@/features/market-turnover/api";
import {
  peekTurnoverMemoryCache,
  readTurnoverCache,
  turnoverDataEqual,
  writeTurnoverCache,
} from "@/features/market-turnover/cache";
import { TurnoverBoard } from "@/features/market-turnover/components/TurnoverBoard";
import { resolveMarketSession } from "@/features/market-turnover/session";
import type { MarketSession, MarketTurnoverResponse } from "@/features/market-turnover/types";
import { cloudbaseApiBase } from "@/shared/config/cloudbase";

const POLL_BASE_MS = 15_000;
const BACKOFF_MS = [30_000, 60_000] as const;

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

export const Route = createFileRoute("/turnover")({
  component: TurnoverPage,
});

function TurnoverPage() {
  const [boot] = useState(() => {
    const cached = readTurnoverCache();
    return { cached, loading: cached === null };
  });
  const [data, setData] = useState<MarketTurnoverResponse | null>(boot.cached);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(boot.loading);
  const [localSession, setLocalSession] = useState<MarketSession>(() =>
    resolveMarketSession(new Date()),
  );

  const dataRef = useRef(data);
  const backoffRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const loadGenRef = useRef(0);
  const prevSessionRef = useRef<MarketSession>(resolveMarketSession(new Date()));
  const mountedRef = useRef(true);

  dataRef.current = data;
  const displaySession = data?.session ?? localSession;

  const configError = cloudbaseApiBase()
    ? null
    : "请在 .env.local 中配置 VITE_CLOUDBASE_API_BASE（本地可用 /cloudbase）";

  const applyFetched = useCallback((res: MarketTurnoverResponse) => {
    if (turnoverDataEqual(dataRef.current, res)) return;
    writeTurnoverCache(res);
    setData(res);
  }, []);

  const clearPollTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const nextPollDelay = useCallback((): number => {
    if (backoffRef.current === 0) return POLL_BASE_MS;
    return BACKOFF_MS[Math.min(backoffRef.current - 1, BACKOFF_MS.length - 1)];
  }, []);

  const load = useCallback(async (): Promise<boolean> => {
    if (!cloudbaseApiBase()) {
      setError(null);
      setLoading(false);
      return false;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const generation = ++loadGenRef.current;

    if (dataRef.current === null) setLoading(true);

    try {
      const res = await fetchMarketTurnover({ signal: controller.signal });
      if (!mountedRef.current || generation !== loadGenRef.current) return false;
      applyFetched(res);
      setError(null);
      backoffRef.current = 0;
      return true;
    } catch (err) {
      if (!mountedRef.current || generation !== loadGenRef.current) return false;
      if (isAbortError(err)) return false;
      const message = err instanceof Error ? err.message : "请求失败";
      setError(message);
      backoffRef.current = Math.min(backoffRef.current + 1, BACKOFF_MS.length);
      return false;
    } finally {
      if (mountedRef.current && generation === loadGenRef.current) {
        setLoading(false);
      }
    }
  }, [applyFetched]);

  const schedulePoll = useCallback(() => {
    clearPollTimer();
    const session = resolveMarketSession(new Date());
    setLocalSession(session);
    if (session !== "continuous") return;

    timerRef.current = setTimeout(async () => {
      if (!mountedRef.current) return;
      const currentSession = resolveMarketSession(new Date());
      setLocalSession(currentSession);
      if (currentSession !== "continuous") {
        clearPollTimer();
        return;
      }
      await load();
      if (!mountedRef.current) return;
      if (resolveMarketSession(new Date()) === "continuous") {
        schedulePoll();
      }
    }, nextPollDelay());
  }, [clearPollTimer, load, nextPollDelay]);

  const handleSessionChange = useCallback(
    (session: MarketSession) => {
      const prev = prevSessionRef.current;
      if (prev !== session) {
        prevSessionRef.current = session;
        setLocalSession(session);
      }

      if (session === "continuous") {
        if (timerRef.current === null || prev !== "continuous") {
          schedulePoll();
        }
      } else {
        clearPollTimer();
      }
    },
    [clearPollTimer, schedulePoll],
  );

  useEffect(() => {
    mountedRef.current = true;
    prevSessionRef.current = resolveMarketSession(new Date());

    // SPA 再点进来：内存已有 → 不立刻打接口；整页刷新：内存空、可有 localStorage → 先展示再 probe
    const hadMemory = peekTurnoverMemoryCache() !== null;

    void (async () => {
      if (!hadMemory) {
        await load();
      }
      if (!mountedRef.current) return;
      handleSessionChange(resolveMarketSession(new Date()));
    })();

    const sessionWatch = setInterval(() => {
      handleSessionChange(resolveMarketSession(new Date()));
    }, 30_000);

    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      clearPollTimer();
      clearInterval(sessionWatch);
    };
  }, [clearPollTimer, handleSessionChange, load]);

  return (
    <TurnoverBoard
      configError={configError}
      data={data}
      error={error}
      loading={loading}
      session={displaySession}
    />
  );
}
