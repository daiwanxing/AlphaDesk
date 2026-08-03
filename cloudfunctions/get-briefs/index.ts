import http from "node:http";
import { URL } from "node:url";
import cloudbase from "@cloudbase/node-sdk";
import { toBriefsResponse, type BriefPersistenceDoc } from "./response";

const ENV_ID = process.env.TCB_ENV || process.env.SCF_NAMESPACE || "trader-d4gl4d7a1cb6baebb";

function sendJson(res: http.ServerResponse, statusCode: number, data: unknown): void {
  // 不设任何 CORS 头，避免与 CloudBase 网关反射 Origin 拼成 "origin,*"
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(data));
}

async function queryBriefs(eventId: string): Promise<BriefPersistenceDoc[]> {
  const app = cloudbase.init({ env: ENV_ID });
  const db = app.database();
  const result = await db.collection("briefs").where({ eventId }).get();
  return (result.data ?? []) as BriefPersistenceDoc[];
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", "http://127.0.0.1");
  const path = url.pathname.replace(/\/$/, "") || "/";

  if (req.method === "GET" && (path === "/" || path === "/briefs" || path === "/get-briefs")) {
    const eventId = url.searchParams.get("eventId")?.trim();
    if (!eventId) {
      sendJson(res, 400, { error: "Missing eventId" });
      return;
    }
    try {
      const docs = await queryBriefs(eventId);
      sendJson(res, 200, toBriefsResponse(eventId, docs));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[get-briefs]", message);
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

server.listen(9000);
