import http from "node:http";
import { URL } from "node:url";
import cloudbase from "@cloudbase/node-sdk";

const ENV_ID =
  process.env.TCB_ENV || process.env.SCF_NAMESPACE || "trader-d4gl4d7a1cb6baebb";

function sendJson(
  res: http.ServerResponse,
  statusCode: number,
  data: unknown,
): void {
  // 不设 CORS 头，避免与网关 Origin 反射拼成 "origin,*"
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(data));
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function authorize(req: http.IncomingMessage): boolean {
  const expected = process.env.BRIEF_API_KEY;
  if (!expected) return false;
  const got = req.headers["x-brief-api-key"];
  return typeof got === "string" && got === expected;
}

async function triggerBackfill(year: number) {
  const app = cloudbase.init({ env: ENV_ID });
  // 同步等待 detect 入队；LLM 仍由 generate-brief / 队列 Timer 消化
  return app.callFunction({
    name: "detect-new-materials",
    data: { year, mode: "backfill" },
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", "http://127.0.0.1");
  const path = url.pathname.replace(/\/$/, "") || "/";

  if (req.method === "GET" && path === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (
    req.method === "POST" &&
    (path === "/" || path === "/backfill" || path === "/trigger-backfill")
  ) {
    if (!authorize(req)) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }

    let year: number | undefined;
    try {
      const raw = await readBody(req);
      const body = raw ? (JSON.parse(raw) as { year?: unknown }) : {};
      year = typeof body.year === "number" ? body.year : Number(body.year);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      sendJson(res, 400, { error: "Invalid year" });
      return;
    }

    try {
      // 只点火 detect；不在此同步跑 LLM
      const result = await triggerBackfill(year);
      sendJson(res, 200, {
        ok: true,
        year,
        detect: result.result ?? result,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[trigger-backfill]", message);
      sendJson(res, 500, { error: message });
    }
    return;
  }

  sendJson(res, 404, { error: "Not Found" });
});

server.listen(9000);
