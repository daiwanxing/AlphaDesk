import type { SectorFundFlowResponse } from "@contracts/sector-fund-flow";

/** Skip setState when poll returns an equivalent frame (ignore asOf churn). */
export function sectorFundFlowEqual(
  a: SectorFundFlowResponse | null,
  b: SectorFundFlowResponse,
): boolean {
  if (!a) return false;
  if (a.ok !== b.ok) return false;
  if (!a.ok) return a.error === b.error;
  if (a.sectors.length !== b.sectors.length) return false;
  for (let i = 0; i < a.sectors.length; i++) {
    const left = a.sectors[i]!;
    const right = b.sectors[i]!;
    if (left.code !== right.code || left.name !== right.name) return false;
    if (left.points.length !== right.points.length) return false;
    if (
      !left.points.every((point, index) => {
        const other = right.points[index];
        return point.t === other?.t && point.v === other.v;
      })
    ) {
      return false;
    }
  }
  return true;
}
