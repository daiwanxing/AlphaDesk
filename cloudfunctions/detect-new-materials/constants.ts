/** 与 server/lib/constants.ts 对齐的 Mag7 / SEC UA（云函数副本） */

export const SEC_USER_AGENT =
  process.env.SEC_USER_AGENT ||
  "InvestorEventTracker/0.1 (personal research; research@example.com)";

export const MAG7 = [
  { ticker: "AAPL", name: "Apple", cik: "0000320193", irUrl: "https://investor.apple.com" },
  {
    ticker: "MSFT",
    name: "Microsoft",
    cik: "0000789019",
    irUrl: "https://www.microsoft.com/en-us/investor",
  },
  { ticker: "GOOGL", name: "Alphabet", cik: "0001652044", irUrl: "https://abc.xyz/investor" },
  { ticker: "AMZN", name: "Amazon", cik: "0001018724", irUrl: "https://ir.aboutamazon.com" },
  { ticker: "META", name: "Meta", cik: "0001326801", irUrl: "https://investor.atmeta.com" },
  { ticker: "NVDA", name: "NVIDIA", cik: "0001045810", irUrl: "https://investor.nvidia.com" },
  { ticker: "TSLA", name: "Tesla", cik: "0001318605", irUrl: "https://ir.tesla.com" },
] as const;

export const MAG7_TICKERS = new Set<string>(MAG7.map((c) => c.ticker));

export function getIrUrl(ticker: string): string | undefined {
  return MAG7.find((c) => c.ticker === ticker)?.irUrl;
}

export const FED_BASE = "https://www.federalreserve.gov";
