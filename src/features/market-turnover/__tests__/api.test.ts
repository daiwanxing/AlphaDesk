import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMarketTurnover } from "../api/turnover";

const cloudbaseUrl = vi.hoisted(() => vi.fn());

vi.mock("@/shared/config/cloudbase", () => ({
  CLOUDBASE_PATHS: { turnover: "/get-market-turnover" },
  cloudbaseUrl,
}));

afterEach(() => {
  vi.restoreAllMocks();
  cloudbaseUrl.mockReset();
});

describe("market-turnover API module", () => {
  it("requests the turnover endpoint and forwards an abort signal", async () => {
    cloudbaseUrl.mockReturnValue("https://api.test/get-market-turnover");
    const signal = new AbortController().signal;
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await fetchMarketTurnover({ signal });

    expect(fetchMock).toHaveBeenCalledWith("https://api.test/get-market-turnover", { signal });
  });
});
