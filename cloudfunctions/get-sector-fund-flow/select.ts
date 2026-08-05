import type { SectorFundFlowPoint, SectorFundFlowSeries } from "@contracts/sector-fund-flow" with {
  "resolution-mode": "import",
};
import { TOP_N } from "./constants";
import type { IndustryBoardRow } from "./eastmoney";

const YI = 1e8;

export function selectAbsTopBoards(rows: IndustryBoardRow[], n = TOP_N): IndustryBoardRow[] {
  return [...rows]
    .filter((row) => Number.isFinite(row.netInflowYuan))
    .sort((a, b) => Math.abs(b.netInflowYuan) - Math.abs(a.netInflowYuan))
    .slice(0, n);
}

/** Parse Eastmoney fflow minute line → HH:mm + 主力净流入（亿元）. */
export function parseFflowLine(line: string): SectorFundFlowPoint | null {
  const parts = line.split(",");
  if (parts.length < 2) return null;

  const datetime = parts[0]?.trim() ?? "";
  const match = datetime.match(/^\d{4}-\d{2}-\d{2} (\d{2}:\d{2})$/);
  if (!match) return null;

  const yuan = Number(parts[1]);
  if (!Number.isFinite(yuan)) return null;

  return { t: match[1]!, v: yuan / YI };
}

export function parseFflowPoints(lines: string[]): SectorFundFlowPoint[] {
  const points: SectorFundFlowPoint[] = [];
  for (const line of lines) {
    const point = parseFflowLine(line);
    if (point) points.push(point);
  }
  return points;
}

export function buildSeries(board: IndustryBoardRow, lines: string[]): SectorFundFlowSeries | null {
  const points = parseFflowPoints(lines);
  if (points.length === 0) return null;

  const last = points[points.length - 1]!;
  return {
    code: board.code,
    name: board.name,
    netInflowYi: last.v,
    points,
  };
}

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]!);
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => run());
  await Promise.all(runners);
  return results;
}

/** Legend / series order: signed net inflow descending. */
export function sortByNetInflowDesc(sectors: SectorFundFlowSeries[]): SectorFundFlowSeries[] {
  return [...sectors].sort((a, b) => b.netInflowYi - a.netInflowYi);
}
