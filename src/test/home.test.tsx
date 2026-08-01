import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { routeTree } from "../routeTree.gen";

function renderApp(initialPath = "/") {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });

  return render(<RouterProvider router={router} />);
}

describe("EventTrackPage", () => {
  it("renders the event tracker header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          year: 2026,
          updatedAt: new Date().toISOString(),
          events: [],
          meta: { earningsDisclosed: 0, earningsPending: 0, fomc: 0 },
        }),
      }),
    );

    renderApp();
    expect(await screen.findByText(/事件追踪 · 七姐妹 & FOMC/i)).toBeInTheDocument();
    expect(await screen.findByText(/该年份暂无事件数据/i)).toBeInTheDocument();

    vi.unstubAllGlobals();
  });
});
