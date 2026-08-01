import { MAG7, SEC_USER_AGENT } from "./constants";

export type SecFilingRow = {
  form: string;
  filingDate: string;
  reportDate: string;
  accessionNumber: string;
  primaryDocument: string;
  ticker: string;
  companyName: string;
  cik: string;
  edgarUrl: string;
};

function edgarFilingUrl(cik: string, accessionNumber: string): string {
  const cikNum = String(Number(cik));
  const accNoDash = accessionNumber.replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accNoDash}/${accessionNumber}-index.htm`;
}

async function fetchSecFilings(cik: string) {
  const padded = cik.replace(/^0+/, "").padStart(10, "0");
  const url = `https://data.sec.gov/submissions/CIK${padded}.json`;
  const res = await fetch(url, {
    headers: { "User-Agent": SEC_USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`SEC submissions failed: ${res.status}`);
  const data = (await res.json()) as {
    filings: {
      recent: {
        accessionNumber: string[];
        filingDate: string[];
        reportDate: string[];
        form: string[];
        primaryDocument: string[];
      };
    };
  };
  const r = data.filings.recent;
  const filings = [];
  for (let i = 0; i < r.form.length; i++) {
    const form = r.form[i]!;
    if (form !== "10-Q" && form !== "10-K") continue;
    filings.push({
      form,
      filingDate: r.filingDate[i]!,
      reportDate: r.reportDate[i] ?? "",
      accessionNumber: r.accessionNumber[i]!,
      primaryDocument: r.primaryDocument[i] ?? "",
    });
  }
  return filings;
}

export async function fetchMag7FilingsForYear(year: number): Promise<SecFilingRow[]> {
  const results = await Promise.all(
    MAG7.map(async (company) => {
      const filings = await fetchSecFilings(company.cik);
      return filings
        .filter((f) => f.filingDate.startsWith(String(year)))
        .map((f) => ({
          ...f,
          ticker: company.ticker,
          companyName: company.name,
          cik: company.cik,
          edgarUrl: edgarFilingUrl(company.cik, f.accessionNumber),
        }));
    }),
  );
  return results.flat();
}
