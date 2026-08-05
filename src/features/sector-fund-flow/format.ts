const YI_TOOLTIP = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: true,
});

/** 轴刻度不强制两位小数：100 →「100亿」，12.5 →「12.5亿」。 */
const YI_AXIS = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 2,
  useGrouping: true,
});

/** 亿元，保留两位小数，带符号（tooltip / 读数用）。 */
export function formatNetInflowYi(yi: number): string {
  const abs = YI_TOOLTIP.format(Math.abs(yi));
  if (yi > 0) return `+${abs}亿`;
  if (yi < 0) return `−${abs}亿`;
  return `${abs}亿`;
}

export function formatNetInflowYiAxis(yi: number): string {
  if (yi === 0) return "0";
  return `${YI_AXIS.format(yi)}亿`;
}
