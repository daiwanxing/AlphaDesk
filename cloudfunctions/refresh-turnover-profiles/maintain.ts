import {
  buildTurnoverProfile,
  PROFILE_MARKET_IDS,
  type ProfileMarketInput,
  type TurnoverProfileDoc,
} from "../get-market-turnover/domain/turnover-profile";
import type { TurnoverDataProvider } from "../get-market-turnover/application/service";
import type { TurnoverRepository } from "../get-market-turnover/infrastructure/repository";
import { MARKETS, type MarketDef } from "../get-market-turnover/market-config";
import {
  mergeMarketCumulatives,
  parseTrendsByDay,
  scaleSeriesToEndpoint,
  type TurnoverPoint,
} from "../get-market-turnover/series";

type MarketId = MarketDef["id"];

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

const TRENDS_DAYS = 3;
const KLINE_LIMIT = 25;
/** 一次列举比保留上限多一些，便于判断是否需要裁剪。 */
const PROFILE_LIST_LIMIT = 80;
const MAX_COMPLETE_PROFILES = 60;

const SOURCE_TRENDS = "eastmoney_trends2";
const SOURCE_TENCENT = "tencent_day_minute";
const SOURCE_SCALED = "scaled_from_hs";
const SOURCE_MISSING = "missing";

export type MaintainMode = "seed" | "daily";

export type MaintainTurnoverProfilesArgs = {
  provider: TurnoverDataProvider;
  repository: TurnoverRepository;
  mode?: MaintainMode;
  now?: Date;
  /** 诊断用：把 degraded 也写库（默认只写 complete，避免污染基线样本）。 */
  saveDegraded?: boolean;
  onError?: (scope: string, message: string) => void;
};

export type MaintainSkip = {
  tradeDate: string;
  reason: "already_complete" | "degraded";
};

export type MaintainTurnoverProfilesResult = {
  ok: boolean;
  mode: MaintainMode;
  savedDates: string[];
  degradedDates: string[];
  skipped: MaintainSkip[];
  pruned: number;
  errors: string[];
};

type MarketMinutes = {
  byDay: Map<string, TurnoverPoint[]>;
  source: string;
};

function shanghaiYmd(now: Date): string {
  return new Date(now.getTime() + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}

function createReporter(args: MaintainTurnoverProfilesArgs, errors: string[]) {
  return (scope: string, error: unknown): void => {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`${scope}: ${message}`);
    args.onError?.(scope, message);
  };
}

/** 东财 trends2 为主；沪深整段缺失时用腾讯多日分时兜底。 */
async function loadMinutes(
  args: MaintainTurnoverProfilesArgs,
  report: (scope: string, error: unknown) => void,
): Promise<Record<MarketId, MarketMinutes>> {
  const byMarket = {} as Record<MarketId, MarketMinutes>;

  await Promise.all(
    MARKETS.map(async (market) => {
      try {
        const lines = await args.provider.fetchTrends2(market.secId, TRENDS_DAYS);
        byMarket[market.id] = {
          byDay: parseTrendsByDay(lines),
          source: SOURCE_TRENDS,
        };
      } catch (err) {
        report(`trends2 failed for ${market.secId}`, err);
        byMarket[market.id] = { byDay: new Map(), source: SOURCE_MISSING };
      }
    }),
  );

  await Promise.all(
    MARKETS.filter((market) => market.id !== "bj" && byMarket[market.id]!.byDay.size === 0).map(
      async (market) => {
        try {
          const byDay = await args.provider.fetchTencentDayMinuteSeries(market.secId);
          byMarket[market.id] = { byDay, source: SOURCE_TENCENT };
        } catch (err) {
          report(`tencent day-minute failed for ${market.secId}`, err);
        }
      },
    ),
  );

  return byMarket;
}

async function loadFullDayAmounts(
  args: MaintainTurnoverProfilesArgs,
  report: (scope: string, error: unknown) => void,
): Promise<Record<MarketId, Map<string, number>>> {
  const byMarket = {} as Record<MarketId, Map<string, number>>;

  await Promise.all(
    MARKETS.map(async (market) => {
      try {
        const bars = await args.provider.fetchDailyKlines(market.secId, KLINE_LIMIT);
        byMarket[market.id] = new Map(bars.map((bar) => [bar.tradeDate, bar.amount]));
      } catch (err) {
        report(`daily kline failed for ${market.secId}`, err);
        byMarket[market.id] = new Map();
      }
    }),
  );

  return byMarket;
}

function candidateDays(minutes: Record<MarketId, MarketMinutes>, todayYmd: string): string[] {
  const days = new Set<string>();
  for (const id of PROFILE_MARKET_IDS) {
    for (const day of minutes[id]!.byDay.keys()) {
      if (day <= todayYmd) days.add(day);
    }
  }
  return [...days].sort((left, right) => left.localeCompare(right));
}

/** 北证无分时源时，用沪深合计的进度形状缩放到日 K 终点；只作诊断，永远算 degraded。 */
function syntheticBjInput(
  minutes: Record<MarketId, MarketMinutes>,
  day: string,
  fullDayAmount: number,
): ProfileMarketInput | null {
  const sh = minutes.sh!.byDay.get(day) ?? [];
  const sz = minutes.sz!.byDay.get(day) ?? [];
  if (sh.length === 0 || sz.length === 0 || !(fullDayAmount > 0)) return null;

  const points = scaleSeriesToEndpoint(mergeMarketCumulatives([sh, sz]), fullDayAmount);
  if (points.length === 0) return null;
  return { points, fullDayAmount, source: SOURCE_SCALED, synthetic: true };
}

function profileForDay(
  minutes: Record<MarketId, MarketMinutes>,
  fullDayAmounts: Record<MarketId, Map<string, number>>,
  day: string,
  generatedAt: string,
): TurnoverProfileDoc {
  const markets = {} as Record<MarketId, ProfileMarketInput>;

  for (const id of PROFILE_MARKET_IDS) {
    const points = minutes[id]!.byDay.get(day) ?? [];
    const fullDayAmount = fullDayAmounts[id]!.get(day) ?? 0;
    markets[id] =
      points.length === 0 && id === "bj"
        ? (syntheticBjInput(minutes, day, fullDayAmount) ?? {
            points,
            fullDayAmount,
            source: SOURCE_MISSING,
          })
        : {
            points,
            fullDayAmount,
            source: points.length > 0 ? minutes[id]!.source : SOURCE_MISSING,
          };
  }

  return buildTurnoverProfile({ tradeDate: day, markets, generatedAt });
}

/** 只保留最近 `MAX_COMPLETE_PROFILES` 个 complete 样本，更早的整体清掉。 */
async function pruneProfiles(
  args: MaintainTurnoverProfilesArgs,
  report: (scope: string, error: unknown) => void,
): Promise<number> {
  try {
    const profiles = await args.repository.listTurnoverProfiles(PROFILE_LIST_LIMIT);
    const complete = profiles
      .filter((profile) => profile.quality?.status === "complete")
      .sort((left, right) => right.tradeDate.localeCompare(left.tradeDate));
    if (complete.length <= MAX_COMPLETE_PROFILES) return 0;

    const cutoff = complete[MAX_COMPLETE_PROFILES - 1]!.tradeDate;
    return await args.repository.deleteTurnoverProfilesBefore(cutoff);
  } catch (err) {
    report("prune profiles failed", err);
    return 0;
  }
}

async function existingCompleteDates(
  args: MaintainTurnoverProfilesArgs,
  report: (scope: string, error: unknown) => void,
): Promise<Set<string>> {
  try {
    const profiles = await args.repository.listTurnoverProfiles(PROFILE_LIST_LIMIT);
    return new Set(
      profiles
        .filter((profile) => profile.quality?.status === "complete")
        .map((profile) => profile.tradeDate),
    );
  } catch (err) {
    report("list profiles failed", err);
    return new Set();
  }
}

/**
 * 收盘维护：拉近几日三市分钟 + 日 K 全天额 → 构建 profile → 幂等落库 → 裁剪历史。
 * seed 与 daily 逻辑一致，都是「尽力写近几日」；单日失败不影响其余日期。
 */
export async function maintainTurnoverProfiles(
  args: MaintainTurnoverProfilesArgs,
): Promise<MaintainTurnoverProfilesResult> {
  const mode = args.mode ?? "daily";
  const now = args.now ?? new Date();
  const errors: string[] = [];
  const report = createReporter(args, errors);

  const alreadyComplete = await existingCompleteDates(args, report);
  const [minutes, fullDayAmounts] = await Promise.all([
    loadMinutes(args, report),
    loadFullDayAmounts(args, report),
  ]);

  const savedDates: string[] = [];
  const degradedDates: string[] = [];
  const skipped: MaintainSkip[] = [];

  for (const day of candidateDays(minutes, shanghaiYmd(now))) {
    if (alreadyComplete.has(day)) {
      skipped.push({ tradeDate: day, reason: "already_complete" });
      continue;
    }

    const profile = profileForDay(minutes, fullDayAmounts, day, now.toISOString());
    const complete = profile.quality.status === "complete";
    if (!complete && !args.saveDegraded) {
      skipped.push({ tradeDate: day, reason: "degraded" });
      continue;
    }

    try {
      await args.repository.saveTurnoverProfile(profile);
      savedDates.push(day);
      if (!complete) degradedDates.push(day);
    } catch (err) {
      report(`save profile failed for ${day}`, err);
    }
  }

  // 即使本日全部 already_complete，也要按保留窗口清理，避免 complete>60 时永不 prune
  const pruned = await pruneProfiles(args, report);

  return {
    ok: errors.length === 0,
    mode,
    savedDates,
    degradedDates,
    skipped,
    pruned,
    errors,
  };
}
