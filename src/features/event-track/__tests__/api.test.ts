import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchEventDetail, fetchTimeline } from "../api/events";
import { fetchBriefs } from "../api/briefs";

const cloudbaseUrl = vi.hoisted(() => vi.fn());

vi.mock("@/shared/config/cloudbase", () => ({
  CLOUDBASE_PATHS: {
    events: "/get-events",
    briefs: "/get-briefs",
    backfill: "/trigger-backfill",
  },
  cloudbaseUrl,
}));

afterEach(() => {
  vi.restoreAllMocks();
  cloudbaseUrl.mockReset();
});

describe("event-track API modules", () => {
  it("builds timeline and detail requests from the events module", async () => {
    cloudbaseUrl.mockImplementation((path: string) => `https://api.test${path}`);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ year: 2026 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ year: 2026 }), { status: 200 }));

    await fetchTimeline(2026);
    await fetchEventDetail(2026, "earnings-AAPL-1");

    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      "https://api.test/get-events?year=2026",
      "https://api.test/get-events/earnings-AAPL-1?year=2026",
    ]);
  });

  it("keeps the brief response envelope when the cloud URL is unavailable", async () => {
    cloudbaseUrl.mockReturnValue(undefined);

    await expect(fetchBriefs("fomc-2026-1")).resolves.toEqual({
      eventId: "fomc-2026-1",
      briefs: [],
    });
  });
});
