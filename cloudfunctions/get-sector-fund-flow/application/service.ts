import type { SectorFundFlowResponse } from "@contracts/sector-fund-flow" with {
  "resolution-mode": "import",
};
import { resolveMarketSession } from "../../get-market-turnover/session";
import { fetchBoardFflowKline, fetchIndustryClist, type IndustryBoardRow } from "../eastmoney";
import { buildSeries, mapPool, selectAbsTopBoards, sortByNetInflowDesc } from "../select";
import { FFLOW_CONCURRENCY, RESPONSE_CACHE_TTL_MS, TOP_N } from "../constants";

const DISCLAIMER =
  "口径：东财板块资金流向·行业（m:90+s:4）主力净流入累计（亿元）· 按|净流入| Top 8";

/** 面向前端的短句；上游细节只打日志，不直接进 UI。 */
const USER_UNAVAILABLE = "板块资金暂时不可用，请稍后重试";

export type SectorFundFlowProvider = {
  fetchIndustryClist(): Promise<IndustryBoardRow[]>;
  fetchBoardFflowKline(code: string): Promise<string[]>;
};

export type SectorFundFlowApplicationDependencies = {
  provider?: SectorFundFlowProvider;
  onError?: (scope: string, message: string) => void;
};

function emptyOk(asOf: string, session: SectorFundFlowResponse["session"]): SectorFundFlowResponse {
  return {
    ok: true,
    asOf,
    session,
    boardType: "industry",
    selection: "abs_top_8",
    sectors: [],
    disclaimer: DISCLAIMER,
  };
}

export function createSectorFundFlowApplication(deps: SectorFundFlowApplicationDependencies = {}) {
  const provider = deps.provider ?? { fetchIndustryClist, fetchBoardFflowKline };
  const onError = deps.onError;
  let cached: { key: string; expiresAt: number; response: SectorFundFlowResponse } | null = null;
  const inFlight = new Map<string, Promise<SectorFundFlowResponse>>();

  async function buildFreshResponse(
    now: Date,
    session: SectorFundFlowResponse["session"],
  ): Promise<SectorFundFlowResponse> {
    const asOf = now.toISOString();

    let boards: IndustryBoardRow[];
    try {
      boards = await provider.fetchIndustryClist();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      onError?.("clist", message);
      return {
        ok: false,
        asOf,
        session,
        boardType: "industry",
        selection: "abs_top_8",
        sectors: [],
        disclaimer: DISCLAIMER,
        error: USER_UNAVAILABLE,
      };
    }

    // 盘前/隔夜东财常清空当日 f62：合法空态，不是故障
    if (boards.length === 0) {
      return emptyOk(asOf, session);
    }

    const selected = selectAbsTopBoards(boards, TOP_N);
    const settled = await mapPool(selected, FFLOW_CONCURRENCY, async (board) => {
      try {
        const lines = await provider.fetchBoardFflowKline(board.code);
        return buildSeries(board, lines);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        onError?.(`fflow:${board.code}`, message);
        return null;
      }
    });

    const sectors = sortByNetInflowDesc(
      settled.filter((item): item is NonNullable<typeof item> => item != null),
    );

    if (sectors.length === 0) {
      // 非连续交易时段分时也常为空；连续时段才视为真失败
      if (session !== "continuous") {
        return emptyOk(asOf, session);
      }
      onError?.("fflow", "all sector fflow series failed");
      return {
        ok: false,
        asOf,
        session,
        boardType: "industry",
        selection: "abs_top_8",
        sectors: [],
        disclaimer: DISCLAIMER,
        error: USER_UNAVAILABLE,
      };
    }

    return {
      ok: true,
      asOf,
      session,
      boardType: "industry",
      selection: "abs_top_8",
      sectors,
      disclaimer: DISCLAIMER,
    };
  }

  async function buildResponse(now: Date): Promise<SectorFundFlowResponse> {
    const session = resolveMarketSession(now);
    const shanghaiDate = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const key = `${shanghaiDate}:${session}`;
    const timestamp = Date.now();

    if (cached?.key === key && timestamp < cached.expiresAt) {
      return cached.response;
    }

    const pending = inFlight.get(key);
    if (pending) return pending;

    const request = buildFreshResponse(now, session).then((response) => {
      if (response.ok) {
        cached = {
          key,
          expiresAt: Date.now() + RESPONSE_CACHE_TTL_MS,
          response,
        };
      }
      return response;
    });
    inFlight.set(key, request);

    try {
      return await request;
    } finally {
      if (inFlight.get(key) === request) inFlight.delete(key);
    }
  }

  return { buildResponse };
}
