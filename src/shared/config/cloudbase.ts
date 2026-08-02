/** CloudBase HTTP 网关 path（与云函数名一致） */
export const CLOUDBASE_PATHS = {
  events: "/get-events",
  briefs: "/get-briefs",
  backfill: "/trigger-backfill",
  turnover: "/get-market-turnover",
} as const;

/** 本地同源代理前缀或生产网关 origin，见 VITE_CLOUDBASE_API_BASE */
export function cloudbaseApiBase(): string | undefined {
  const base = import.meta.env.VITE_CLOUDBASE_API_BASE as string | undefined;
  const trimmed = base?.trim().replace(/\/$/, "");
  return trimmed || undefined;
}

/** `${API_BASE}${path}`；未配置 base 时返回 undefined */
export function cloudbaseUrl(path: string): string | undefined {
  const base = cloudbaseApiBase();
  if (!base) return undefined;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
