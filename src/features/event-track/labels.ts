import type { BriefSlot } from "./types";

export const SLOT_LABEL: Record<BriefSlot, string> = {
  earnings: "财报",
  statement: "Statement",
  minutes: "Minutes",
  sep: "SEP / 点阵图",
};

export const EVENT_KIND_LABEL = {
  earnings: "财报",
  fomc: "议息",
} as const;

export const EARNINGS_STATUS_LABEL = {
  disclosed: "已披露",
  pending: "待披露",
} as const;

export const FOMC_STATUS_LABEL = {
  held: "已召开",
  upcoming: "待召开",
} as const;

const MONTH_ABBR: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const SEC_FORM_RE = /\s*\((10-[KQ]|8-K|6-K|20-F)\)\s*/i;

/** Nasdaq Calendar `time` codes → short Chinese labels. */
export function formatEarningsTime(raw?: string): string | undefined {
  if (!raw) return undefined;
  const key = raw.trim().toLowerCase();
  if (key === "time-after-hours" || key === "after-hours" || key === "amc") return "盘后";
  if (
    key === "time-pre-market" ||
    key === "time-before-open" ||
    key === "before-open" ||
    key === "bmo"
  ) {
    return "盘前";
  }
  if (key === "time-not-supplied" || key === "not-supplied" || key === "n/a") return undefined;
  if (/^\d/.test(key) || key.includes(":")) return raw;
  return raw.replace(/^time-/i, "").replace(/-/g, " ");
}

/** Compact earnings title; keep SEC form as a separate chip when present. */
export function formatEarningsTitle(
  label: string,
  form?: string,
): { title: string; formChip?: string } {
  const formFromLabel = label.match(SEC_FORM_RE)?.[1]?.toUpperCase();
  const formChip = (form || formFromLabel)?.toUpperCase();
  let core = label.replace(SEC_FORM_RE, " ").trim();

  // FY2026 Q2 → 2026 Q2；FY2026 (Jul) → 2026 7月
  core = core.replace(/\bFY\s*(\d{4})\b/i, "$1");
  core = core.replace(/\s*\((\w{3})\)/i, (_, mon: string) => {
    const n = MONTH_ABBR[mon.toLowerCase()];
    return n ? ` ${n}月` : ` ${mon}`;
  });

  return { title: core.replace(/\s+/g, " ").trim(), formChip };
}

/** Prefer meetingEndDate — production labels are `January 20, 2026` or ISO, not `January 2026`. */
export function formatFomcTitleFromDate(iso: string): string {
  const [year, month] = iso.slice(0, 10).split("-").map(Number);
  if (!year || !month) return iso;
  return `${year}年${month}月会议`;
}

export function formatRelativeDay(dayKey: string, todayKey: string): string {
  const diffDays =
    (Date.parse(dayKey + "T12:00:00") - Date.parse(todayKey + "T12:00:00")) / 86_400_000;

  if (diffDays === 0) return "今天";
  if (diffDays === 1) return "明天";
  if (diffDays === -1) return "昨天";
  if (diffDays > 1) return `${diffDays}天后`;
  return `${Math.abs(diffDays)}天前`;
}

export function formatCardDay(dayKey: string): string {
  return new Date(dayKey + "T12:00:00").toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
  });
}

export function statusTagClass(status: string): string {
  if (status === "已披露" || status === "已召开") return "tag tag--success";
  if (status === "待披露") return "tag tag--warn";
  return "tag";
}
