/** 原文抓取：SEC filing / Fed HTML → 纯文本 */

const SEC_UA =
  process.env.SEC_USER_AGENT ||
  "InvestorEventTracker/0.1 (personal research; research@example.com)";

const MAG7_CIK: Record<string, string> = {
  AAPL: "0000320193",
  MSFT: "0000789019",
  GOOGL: "0001652044",
  AMZN: "0001018724",
  META: "0001326801",
  NVDA: "0001045810",
  TSLA: "0001318605",
};

const MAX_CHARS = Number(process.env.BRIEF_SOURCE_MAX_CHARS || 100_000);

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateForLlm(text: string): string {
  if (text.length <= MAX_CHARS) return text;
  const markers = [
    /Item\s+7[\.\s–—-]/i,
    /Item\s+8[\.\s–—-]/i,
    /MANAGEMENT['']S DISCUSSION/i,
    /CONSOLIDATED STATEMENTS OF (INCOME|OPERATIONS)/i,
  ];
  for (const re of markers) {
    const m = re.exec(text);
    if (m && m.index != null) {
      const start = Math.max(0, m.index - 2000);
      return text.slice(start, start + MAX_CHARS);
    }
  }
  return text.slice(0, MAX_CHARS);
}

async function fetchText(url: string, accept = "text/html,application/xhtml+xml"): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": SEC_UA,
      Accept: accept,
      "Accept-Encoding": "identity",
    },
  });
  if (!res.ok) {
    throw new Error(`fetch ${url} failed: ${res.status}`);
  }
  return res.text();
}

function parseEdgarParts(eventId: string, sourceUrls: string[]) {
  const ticker = /^earnings-([A-Z]+)-/.exec(eventId)?.[1];
  const accFromId = /^earnings-[A-Z]+-(\d{18})$/.exec(eventId)?.[1];
  let cik = ticker ? MAG7_CIK[ticker] : undefined;
  let accessionNoDash = accFromId;

  for (const u of sourceUrls) {
    const m = /edgar\/data\/(\d+)\/(\d{18})\//i.exec(u);
    if (m) {
      cik = m[1]!.padStart(10, "0");
      accessionNoDash = m[2];
      break;
    }
  }

  return { ticker, cik, accessionNoDash };
}

async function resolvePrimaryDocument(
  cik: string,
  accessionNoDash: string,
): Promise<{ primaryDocument: string; accessionNumber: string }> {
  const padded = cik.replace(/^0+/, "").padStart(10, "0");
  const url = `https://data.sec.gov/submissions/CIK${padded}.json`;
  const raw = await fetchText(url, "application/json");
  const data = JSON.parse(raw) as {
    filings: {
      recent: {
        accessionNumber: string[];
        primaryDocument: string[];
        form: string[];
      };
    };
  };
  const r = data.filings.recent;
  for (let i = 0; i < r.accessionNumber.length; i++) {
    const acc = r.accessionNumber[i]!;
    if (acc.replace(/-/g, "") === accessionNoDash) {
      return { primaryDocument: r.primaryDocument[i]!, accessionNumber: acc };
    }
  }
  throw new Error(`primaryDocument not found for accession ${accessionNoDash}`);
}

async function fetchSecFilingText(eventId: string, sourceUrls: string[]): Promise<{
  text: string;
  sourceUrl: string;
}> {
  const { cik, accessionNoDash } = parseEdgarParts(eventId, sourceUrls);
  if (!cik || !accessionNoDash) {
    throw new Error("cannot resolve CIK/accession from eventId/sourceUrls");
  }
  const { primaryDocument, accessionNumber } = await resolvePrimaryDocument(
    cik,
    accessionNoDash,
  );
  const cikNum = String(Number(cik));
  const docUrl = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accessionNoDash}/${primaryDocument}`;
  const html = await fetchText(docUrl);
  const text = truncateForLlm(htmlToText(html));
  if (text.length < 200) {
    throw new Error("SEC filing text too short after strip");
  }
  return {
    text,
    sourceUrl: `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accessionNoDash}/${accessionNumber}-index.htm`,
  };
}

async function fetchFedMaterialText(sourceUrls: string[]): Promise<{
  text: string;
  sourceUrl: string;
}> {
  const fedUrl =
    sourceUrls.find((u) => /federalreserve\.gov/i.test(u)) ?? sourceUrls[0];
  if (!fedUrl) throw new Error("no Fed sourceUrl");
  const html = await fetchText(fedUrl);
  const text = truncateForLlm(htmlToText(html));
  if (text.length < 100) {
    throw new Error("Fed material text too short after strip");
  }
  return { text, sourceUrl: fedUrl };
}

export type FetchedSource = {
  text: string;
  sourceUrl: string;
  charCount: number;
};

/** 优先用 job.sourceText（调试/CN 出口受限时）；否则按 slot 抓取 */
export async function fetchSourceForJob(job: {
  eventId: string;
  slot: string;
  sourceUrls?: string[];
  sourceText?: string;
}): Promise<FetchedSource> {
  if (job.sourceText && job.sourceText.trim().length > 100) {
    const text = truncateForLlm(job.sourceText.trim());
    return {
      text,
      sourceUrl: job.sourceUrls?.[0] ?? "inline:sourceText",
      charCount: text.length,
    };
  }

  const urls = job.sourceUrls ?? [];
  if (job.slot === "earnings") {
    const r = await fetchSecFilingText(job.eventId, urls);
    return { ...r, charCount: r.text.length };
  }
  const r = await fetchFedMaterialText(urls);
  return { ...r, charCount: r.text.length };
}
