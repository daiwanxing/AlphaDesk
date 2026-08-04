import type {
  MarketSession,
  TurnoverInsight,
  TurnoverInsightReason,
  TurnoverPaceState,
} from "@contracts/market-turnover";

const PACE_LABELS: Record<TurnoverPaceState, string> = {
  strongly_contracting: "明显缩量",
  contracting: "温和缩量",
  normal: "正常",
  expanding: "温和放量",
  strongly_expanding: "明显放量",
};

/** Scheme B tone keys for color / marker morphology. */
export type PaceTone = "vlow" | "low" | "mid" | "high" | "vhigh";

const PACE_TONES: Record<TurnoverPaceState, PaceTone> = {
  strongly_contracting: "vlow",
  contracting: "low",
  normal: "mid",
  expanding: "high",
  strongly_expanding: "vhigh",
};

const UNAVAILABLE_REASON_LABELS: Record<TurnoverInsightReason, string> = {
  insufficient_shape_days: "形状样本不足（少于 2 个交易日）",
  insufficient_scale_days: "日K尺度样本不足（少于 10 个交易日）",
  insufficient_samples: "同刻样本不足",
  invalid_profile: "历史 profile 数据无效",
  invalid_current_data: "当前成交额数据无效",
  stale_profile: "历史 profile 数据过期",
  profile_missing: "历史 profile 数据缺失",
};

export const INSIGHT_PANEL_HEADING = "量能节奏";

/** 0–150 轨上 100% 中位线的 left%。 */
export const PACE_RAIL_MEDIAN_LEFT_PCT = (100 / 150) * 100;

export type InsightPanelCopyActive = {
  status: "active";
  paceLabel: string;
  paceTone: PaceTone;
  paceRatioText: string;
  paceRatio: number;
  isBootstrap: boolean;
  foot: string;
};

export type InsightPanelCopyWarmingUp = {
  status: "warming_up";
  headline: string;
  detail: string;
  timeLabel: string;
};

export type InsightPanelCopyUnavailable = {
  status: "unavailable";
  title: string;
  reasonText: string;
  timeLabel: string;
};

export type InsightPanelCopyFinal = {
  status: "final";
  statusWord: string;
  foot: string;
};

export type InsightPanelCopy =
  | InsightPanelCopyActive
  | InsightPanelCopyWarmingUp
  | InsightPanelCopyUnavailable
  | InsightPanelCopyFinal;

export function hhmmFromEffectiveTime(effectiveTime: string): string {
  return effectiveTime.match(/T(\d{2}:\d{2})/)?.[1] ?? effectiveTime;
}

function formatTimeLabel(effectiveTime: string): string {
  return `截至 ${hhmmFromEffectiveTime(effectiveTime)}`;
}

function footForActive(insight: TurnoverInsight): string {
  const baseline = insight.baseline;
  if (!baseline) return "";

  if (baseline.quality === "bootstrap") {
    const parts: string[] = [];
    if (baseline.shapeDays != null) parts.push(`形状 ${baseline.shapeDays} 日`);
    if (baseline.scaleDays != null) parts.push(`尺度 ${baseline.scaleDays} 日K`);
    parts.push("样本较少");
    return parts.join(" · ");
  }

  const scale =
    baseline.scaleDays != null
      ? `尺度 ${baseline.scaleDays} 日K`
      : `尺度 ${baseline.windowDays} 日K`;
  return `${scale} · n=${baseline.sampleDays}`;
}

function activeCopy(insight: TurnoverInsight): InsightPanelCopyActive {
  const paceState = insight.paceState ?? "normal";
  const paceRatio = insight.paceRatio ?? 1;
  const baseline = insight.baseline;
  const quality = baseline?.quality ?? "bootstrap";

  return {
    status: "active",
    paceLabel: PACE_LABELS[paceState],
    paceTone: PACE_TONES[paceState],
    paceRatioText: `${Math.round(paceRatio * 100)}%`,
    paceRatio,
    isBootstrap: quality === "bootstrap",
    foot: footForActive(insight),
  };
}

function warmingUpCopy(
  insight: TurnoverInsight,
  session?: MarketSession,
): InsightPanelCopyWarmingUp {
  const timeLabel = formatTimeLabel(insight.effectiveTime);

  // continuous 整段开盘初期文案；其它会话仅 09:30–09:45 窗口走同一套。
  if (session === "continuous") {
    return {
      status: "warming_up",
      headline: "开盘初期",
      detail: "09:45 后再给出放缩量与全天区间",
      timeLabel,
    };
  }
  if (session !== "pre_open" && session !== "closed" && session !== "lunch") {
    const hhmm = hhmmFromEffectiveTime(insight.effectiveTime);
    if (hhmm >= "09:30" && hhmm < "09:45") {
      return {
        status: "warming_up",
        headline: "开盘初期",
        detail: "09:45 后再给出放缩量与全天区间",
        timeLabel,
      };
    }
  }

  return {
    status: "warming_up",
    headline: "09:45 后可用",
    detail: "开盘后对比近期典型节奏",
    timeLabel,
  };
}

function unavailableCopy(insight: TurnoverInsight): InsightPanelCopyUnavailable {
  const reason = insight.reason ?? "invalid_current_data";
  return {
    status: "unavailable",
    title: "预测暂不可用",
    reasonText: UNAVAILABLE_REASON_LABELS[reason],
    timeLabel: formatTimeLabel(insight.effectiveTime),
  };
}

function finalCopy(insight: TurnoverInsight): InsightPanelCopyFinal {
  return {
    status: "final",
    statusWord: "收盘",
    foot: `${formatTimeLabel(insight.effectiveTime)} · 实际单点`,
  };
}

export function insightPanelCopy(
  insight: TurnoverInsight,
  session?: MarketSession,
): InsightPanelCopy {
  switch (insight.status) {
    case "warming_up":
      return warmingUpCopy(insight, session);
    case "unavailable":
      return unavailableCopy(insight);
    case "final":
      return finalCopy(insight);
    case "active":
      return activeCopy(insight);
  }
}

/** Map paceRatio (1 = 100%) onto 0–150 rail axis → CSS left %. */
export function paceRailLeftPercent(paceRatio: number, railMax = 150): number {
  const pct = Math.max(0, Math.min(railMax, paceRatio * 100));
  return (pct / railMax) * 100;
}
