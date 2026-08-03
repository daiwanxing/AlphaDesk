import type { AddressInfo } from "node:net";

import { describe, expect, it } from "vitest";

import { createTurnoverServer } from "./http";

async function startServer(buildResponse: () => Promise<unknown>) {
  const server = createTurnoverServer(buildResponse);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as AddressInfo;
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
  };
}

describe("get-market-turnover HTTP boundary", () => {
  it("serves the response builder at the root and function alias", async () => {
    const body = { ok: true, marker: "contract" };
    const { server, url } = await startServer(async () => body);

    try {
      const [root, alias] = await Promise.all([
        fetch(`${url}/`),
        fetch(`${url}/get-market-turnover`),
      ]);

      expect(root.status).toBe(200);
      expect(await root.json()).toEqual(body);
      expect(alias.status).toBe(200);
      expect(await alias.json()).toEqual(body);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("returns a JSON error when the response builder fails", async () => {
    const { server, url } = await startServer(async () => {
      throw new Error("provider unavailable");
    });

    try {
      const response = await fetch(`${url}/`);

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "provider unavailable" });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("keeps health and not-found behavior independent from the builder", async () => {
    let calls = 0;
    const { server, url } = await startServer(async () => {
      calls += 1;
      return { ok: true };
    });

    try {
      const [health, missing] = await Promise.all([
        fetch(`${url}/health`),
        fetch(`${url}/missing`),
      ]);

      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ ok: true });
      expect(missing.status).toBe(404);
      expect(await missing.json()).toEqual({ error: "Not Found" });
      expect(calls).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
