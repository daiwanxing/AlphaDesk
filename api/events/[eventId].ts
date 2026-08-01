import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cacheHeaders, getEventDetail, parseYearParam } from "../../server/api/routes.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const rawId = req.query.eventId;
  const id = decodeURIComponent(Array.isArray(rawId) ? rawId[0] : (rawId ?? ""));

  if (!id) {
    res.status(400).json({ error: "Missing event id" });
    return;
  }

  try {
    const year = parseYearParam(req.query.year);
    if (year === null) {
      res.status(400).json({ error: "Invalid year" });
      return;
    }
    const detail = await getEventDetail(year, id);
    if (!detail) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    for (const [k, v] of Object.entries(cacheHeaders())) {
      res.setHeader(k, v);
    }
    res.status(200).json(detail);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/events/detail]", message);
    res.status(500).json({ error: message });
  }
}
