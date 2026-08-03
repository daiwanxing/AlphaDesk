/** Prompt 版本与 mock sections；Phase B 用 requiredSectionIds + LLM */

import type {
  BriefSection as BriefSectionContract,
  BriefSlot as BriefSlotContract,
} from "@contracts/briefs" with { "resolution-mode": "import" };

export type BriefSlot = BriefSlotContract;
export type BriefSection = BriefSectionContract;

const DISCLAIMER = "AI 生成 · 非正式官方文件";

/** earnings-trader-v1：按交易员验证商业模式 / 盈利质量 / 资金与估值重估 */
const EARNINGS_IDS = [
  "market_take",
  "pnl_quality",
  "bs_cf_check",
  "notes_red_flags",
  "kpi_marginal",
  "mda_outlook",
  "trade_lens",
] as const;

const STATEMENT_IDS = ["rate_decision", "stance", "economy_risks"] as const;
const MINUTES_IDS = ["disagreement", "policy_path"] as const;
const SEP_IDS = ["dots_path", "macro_projections"] as const;

const EARNINGS_SECTIONS: BriefSection[] = [
  {
    id: "market_take",
    heading: "交易结论 / 预期差",
    body: "【mock】质量与趋势尚可；是否超预期需对照一致预期（原文未给）。",
  },
  {
    id: "pnl_quality",
    heading: "利润表与盈利质量",
    body: "【mock】收入与利润示例；关注毛利率与扣非，非正式摘要。",
  },
  {
    id: "bs_cf_check",
    heading: "资产负债与现金流验证",
    body: "【mock】经营现金流与净利润关系需核对；FCF 为估值核心输入。",
  },
  {
    id: "notes_red_flags",
    heading: "附注与会计红旗",
    body: "原文未提及",
  },
  {
    id: "kpi_marginal",
    heading: "关键指标与边际变化",
    body: "【mock】优先看 YoY/QoQ 边际，而非绝对水平。",
  },
  {
    id: "mda_outlook",
    heading: "管理层与前瞻",
    body: "【mock】管理层表述需与财务数据交叉验证。",
  },
  {
    id: "trade_lens",
    heading: "资金面与行业特异点",
    body: "【mock】关注回购分红与行业周期信号。",
  },
];

const STATEMENT_SECTIONS: BriefSection[] = [
  { id: "rate_decision", heading: "利率决定", body: "【mock】维持政策利率不变（示例）。" },
  { id: "stance", heading: "政策立场", body: "【mock】继续关注通胀与就业平衡。" },
  { id: "economy_risks", heading: "经济与风险", body: "【mock】下行风险仍存，数据依赖。" },
];

const MINUTES_SECTIONS: BriefSection[] = [
  { id: "disagreement", heading: "分歧与讨论", body: "【mock】委员对路径节奏存在讨论（示例）。" },
  { id: "policy_path", heading: "政策路径", body: "【mock】多数倾向耐心观望。" },
];

const SEP_SECTIONS: BriefSection[] = [
  { id: "dots_path", heading: "点阵图路径", body: "【mock】中位路径示例，非正式投影。" },
  { id: "macro_projections", heading: "宏观预测", body: "【mock】增长与通胀预测示例。" },
];

export function requiredSectionIds(slot: BriefSlot): string[] {
  switch (slot) {
    case "earnings":
      return [...EARNINGS_IDS];
    case "statement":
      return [...STATEMENT_IDS];
    case "minutes":
      return [...MINUTES_IDS];
    case "sep":
      return [...SEP_IDS];
  }
}

export function promptVersionForSlot(slot: BriefSlot): string {
  switch (slot) {
    case "earnings":
      return "earnings-trader-v1";
    case "statement":
      return "fomc-statement-std-v1";
    case "minutes":
      return "fomc-minutes-std-v1";
    case "sep":
      return "fomc-sep-std-v1";
  }
}

/** Phase A fallback：无 DEEPSEEK_API_KEY 时使用 */
export function mockSections(slot: BriefSlot): BriefSection[] {
  switch (slot) {
    case "earnings":
      return EARNINGS_SECTIONS.map((s) => ({ ...s }));
    case "statement":
      return STATEMENT_SECTIONS.map((s) => ({ ...s }));
    case "minutes":
      return MINUTES_SECTIONS.map((s) => ({ ...s }));
    case "sep":
      return SEP_SECTIONS.map((s) => ({ ...s }));
  }
}

export function defaultDisclaimer(): string {
  return DISCLAIMER;
}

export function inferEventKind(eventId: string): "earnings" | "fomc" {
  return eventId.startsWith("fomc-") ? "fomc" : "earnings";
}

export function inferTicker(eventId: string): string | undefined {
  const m = /^earnings-([A-Z]+)-/.exec(eventId);
  return m?.[1];
}
