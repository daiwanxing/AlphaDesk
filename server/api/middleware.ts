import type { ServerResponse } from "node:http";
import type { Connect } from "vite";
import { cacheHeaders, getEventDetail, getEventsTimeline, parseYearParam } from "./routes.ts";

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>,
) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) {
      res.setHeader(k, v);
    }
  }
  res.end(JSON.stringify(body));
}

export function createApiMiddleware(): Connect.NextHandleFunction {
  return async (req, res, next) => {
    if (!req.url?.startsWith("/api/")) return next();

    const url = new URL(req.url, "http://localhost");
    const headers = cacheHeaders();

    try {
      if (url.pathname === "/api/events" && req.method === "GET") {
        const year = parseYearParam(url.searchParams.get("year"));
        if (year === null) {
          sendJson(res, 400, { error: "Invalid year" });
          return;
        }
        const timeline = await getEventsTimeline(year);
        sendJson(res, 200, timeline, headers);
        return;
      }

      if (url.pathname.startsWith("/api/events/") && req.method === "GET") {
        const year = parseYearParam(url.searchParams.get("year"));
        if (year === null) {
          sendJson(res, 400, { error: "Invalid year" });
          return;
        }
        const id = decodeURIComponent(url.pathname.slice("/api/events/".length));
        const detail = await getEventDetail(year, id);
        if (!detail) {
          sendJson(res, 404, { error: "Event not found" });
          return;
        }
        sendJson(res, 200, detail, headers);
        return;
      }

      sendJson(res, 404, { error: "Not found" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, { error: message });
    }
  };
}
