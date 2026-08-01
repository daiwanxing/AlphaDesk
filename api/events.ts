import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cacheHeaders, getEventsTimeline, parseYearParam } from "../server/api/routes.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const year = parseYearParam(req.query.year);
    if (year === null) {
      res.status(400).json({ error: "Invalid year" });
      return;
    }
    const timeline = await getEventsTimeline(year);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    for (const [k, v] of Object.entries(cacheHeaders())) {
      res.setHeader(k, v);
    }
    res.status(200).json(timeline);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/events]", message);
    res.status(500).json({ error: message });
  }
}
