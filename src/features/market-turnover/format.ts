const YI = 1e8;

/** Shared by NumberFlow + Intl string formatters — integer 亿 + grouping. */
export const YI_FORMAT_OPTIONS = {
  maximumFractionDigits: 0,
  useGrouping: true,
} as const;

const YI_FORMAT = new Intl.NumberFormat("zh-CN", YI_FORMAT_OPTIONS);

export type AmountParts = {
  value: number;
  suffix: "亿";
};

export function amountParts(yuan: number): AmountParts {
  return { value: Math.round(yuan / YI), suffix: "亿" };
}

export function formatAmountYuan(n: number): string {
  return `${YI_FORMAT.format(Math.round(n / YI))}亿`;
}

/** 坐标轴统一「亿」+ 三位分节；0 显示为「0」。 */
export function formatAmountYi(n: number): string {
  if (n === 0) return "0";
  return formatAmountYuan(n);
}
