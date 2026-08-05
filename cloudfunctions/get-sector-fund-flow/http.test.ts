import type { AddressInfo } from "node:net";

import { describe, expect, it } from "vitest";

import type { SectorFundFlowResponse } from "@contracts/sector-fund-flow" with {
  "resolution-mode": "import",
};
import { createSectorFundFlowServer } from "./http";

const responseBody: SectorFundFlowResponse = {
  ok: true,
  asOf: "2026-08-04T14:56:00+08:00",
  session: "continuous",
  boardType: "industry",
  selection: "abs_top_8",
  sectors: [],
  disclaimer: "test",
};

async function startServer(buildResponse: () => Promise<SectorFundFlowResponse>) {
  const server = createSectorFundFlowServer(buildResponse);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as AddressInfo;
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
  };
}

describe("get-sector-fund-flow HTTP boundary", () => {
  it("serves root and function alias", async () => {
    const { server, url } = await startServer(async () => responseBody);
    try {
      const [root, alias, health] = await Promise.all([
        fetch(`${url}/`),
        fetch(`${url}/get-sector-fund-flow`),
        fetch(`${url}/health`),
      ]);
      expect(root.status).toBe(200);
      expect(alias.status).toBe(200);
      expect(await root.json()).toEqual(responseBody);
      expect(await alias.json()).toEqual(responseBody);
      expect(await health.json()).toEqual({ ok: true });
    } finally {
      server.close();
    }
  });
});
