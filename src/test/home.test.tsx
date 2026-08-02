import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { routeTree } from "../routeTree.gen";

function renderApp(initialPath = "/") {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });

  return { ...render(<RouterProvider router={router} />), router };
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

    const { router } = renderApp();
    await waitFor(() => expect(router.state.status).toBe("idle"), { timeout: 5000 });

    expect(await screen.findByText(/事件追踪 · A股量能/i)).toBeInTheDocument();
    expect(await screen.findByText(/该年份暂无事件数据/i)).toBeInTheDocument();

    vi.unstubAllGlobals();
  });
});
