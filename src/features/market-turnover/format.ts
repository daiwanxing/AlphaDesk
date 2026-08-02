const YI = 1e8;
const WAN_YI = 1e12;

function trimTrailingZeros(n: number): string {
  const fixed = n.toFixed(1);
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
}

export function formatAmountYuan(n: number): string {
  if (n >= WAN_YI) {
    return `${trimTrailingZeros(n / WAN_YI)}万亿`;
  }
  return `${trimTrailingZeros(n / YI)}亿`;
}

export function formatDelta(delta: number, pct: number): string {
  if (delta === 0) {
    return `0 (+0.0%)`;
  }

  const sign = delta > 0 ? "+" : "-";
  const amount = formatAmountYuan(Math.abs(delta));
  const pctSign = pct >= 0 ? "+" : "-";
  const pctValue = (Math.abs(pct) * 100).toFixed(1);
  return `${sign}${amount} (${pctSign}${pctValue}%)`;
}
