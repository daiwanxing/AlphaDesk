/** Colored brand marks via theSVG CDN (jsDelivr). Pinned tag for stable URLs. */
export const THESVG_REF = "v2.0.0";

const THESVG_BASE = `https://cdn.jsdelivr.net/gh/glincker/thesvg@${THESVG_REF}/public/icons`;

/** Apple theSVG default is white — use Wikimedia black mark on light UI. */
const APPLE_LOGO_URL = "https://upload.wikimedia.org/wikipedia/commons/f/fa/Apple_logo_black.svg";

/**
 * theSVG nvidia/default includes wordmark; use Simple Icons eye-only mark (brand green).
 * Color path: https://cdn.simpleicons.org/nvidia/76B900
 */
const NVDA_LOGO_URL = "https://cdn.simpleicons.org/nvidia/76B900";

const TICKER_THESVG_SLUGS: Record<string, string> = {
  MSFT: "microsoft",
  GOOGL: "google",
  AMZN: "amazon",
  META: "meta",
  TSLA: "tesla",
};

export function logoUrlForTicker(ticker: string): string | null {
  if (ticker === "AAPL") return APPLE_LOGO_URL;
  if (ticker === "NVDA") return NVDA_LOGO_URL;
  const slug = TICKER_THESVG_SLUGS[ticker];
  if (!slug) return null;
  return `${THESVG_BASE}/${slug}/default.svg`;
}

export function fallbackInitials(label: string): string {
  return label.slice(0, 2).toUpperCase();
}
