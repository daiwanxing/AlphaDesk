import http from "node:http";
import { URL } from "node:url";
import {
  cacheHeaders,
  getEventDetail,
  getEventsTimeline,
  parseYearParam,
} from "../../server/api/routes.ts";

function sendJson(
  res: http.ServerResponse,
  statusCode: number,
  data: unknown,
  extraHeaders?: Record<string, string>,
): void {
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders,
  };
  // 不设 CORS 头，避免与 CloudBase 网关反射 Origin 拼成 "origin,*"
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(data));
}

/** 网关 path 可能是 /get-events 或 /get-events/:id */
function normalizePath(pathname: string): string {
  let path = pathname.replace(/\/$/, "") || "/";
  if (path === "/get-events") return "/";
  if (path.startsWith("/get-events/")) {
    return path.slice("/get-events".length) || "/";
  }
  return path;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", "http://127.0.0.1");
  const path = normalizePath(url.pathname);
  const cache = cacheHeaders();

  if (req.method === "GET" && path === "/health") {
    sendJson(res, 200, { ok: true }, cache);
    return;
  }

  if (req.method === "GET" && (path === "/" || path === "/events")) {
    const year = parseYearParam(url.searchParams.get("year"));
    if (year === null) {
      sendJson(res, 400, { error: "Invalid year" }, cache);
      return;
    }
    try {
      const timeline = await getEventsTimeline(year);
      sendJson(res, 200, timeline, cache);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[get-events]", message);
      sendJson(res, 500, { error: message }, cache);
    }
    return;
  }

  if (req.method === "GET" && path.startsWith("/") && path.length > 1) {
    const id = decodeURIComponent(path.slice(1));
    const year = parseYearParam(url.searchParams.get("year"));
    if (year === null) {
      sendJson(res, 400, { error: "Invalid year" }, cache);
      return;
    }
    try {
      const detail = await getEventDetail(year, id);
      if (!detail) {
        sendJson(res, 404, { error: "Event not found" }, cache);
        return;
      }
      sendJson(res, 200, detail, cache);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[get-events/detail]", message);
      sendJson(res, 500, { error: message }, cache);
    }
    return;
  }

  sendJson(res, 404, { error: "Not Found" }, cache);
});

server.listen(9000);
