import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { routeTree } from "../routeTree.gen";

function renderApp(initialPath = "/events") {
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

    expect(router.state.location.pathname).toBe("/events");
    expect(await screen.findByText("AlphaDesk")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /事件追踪/ })).toHaveAttribute(
      "href",
      "/events",
    );
    expect(await screen.findByText(/该年份暂无事件数据/i)).toBeInTheDocument();

    vi.unstubAllGlobals();
  });
});
