import http from "node:http";
import { URL } from "node:url";
import type { SectorFundFlowResponse } from "@contracts/sector-fund-flow" with {
  "resolution-mode": "import",
};

export type SectorFundFlowResponseBuilder = (now: Date) => Promise<SectorFundFlowResponse>;

function sendJson(res: http.ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(data));
}

export function createSectorFundFlowServer(
  buildResponse: SectorFundFlowResponseBuilder,
): http.Server {
  return http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", "http://127.0.0.1");
    const path = url.pathname.replace(/\/$/, "") || "/";

    if (req.method === "GET" && (path === "/" || path === "/get-sector-fund-flow")) {
      try {
        sendJson(res, 200, await buildResponse(new Date()));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("[get-sector-fund-flow]", message);
        sendJson(res, 500, { error: message });
      }
      return;
    }

    if (req.method === "GET" && path === "/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 404, { error: "Not Found" });
  });
}
