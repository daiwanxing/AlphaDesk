import type { SectorFundFlowResponse } from "@contracts/sector-fund-flow";
import { CLOUDBASE_PATHS, cloudbaseUrl } from "@/shared/config/cloudbase";
import { parseJson } from "../http";

export async function fetchSectorFundFlow(options?: {
  signal?: AbortSignal;
}): Promise<SectorFundFlowResponse> {
  const url = cloudbaseUrl(CLOUDBASE_PATHS.sectorFundFlow);
  if (!url) {
    throw new Error("VITE_CLOUDBASE_API_BASE is not set");
  }
  const res = await fetch(url, { signal: options?.signal });
  return parseJson<SectorFundFlowResponse>(res);
}
