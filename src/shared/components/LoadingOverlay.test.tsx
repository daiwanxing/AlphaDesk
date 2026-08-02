import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoadingOverlay } from "./LoadingOverlay";

describe("LoadingOverlay", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits 250ms before mounting the content mask", () => {
    vi.useFakeTimers();
    render(<LoadingOverlay loading label="加载事件追踪…" />);

    expect(screen.queryByRole("status", { name: "加载事件追踪…" })).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(249));
    expect(screen.queryByRole("status", { name: "加载事件追踪…" })).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("status", { name: "加载事件追踪…" })).toBeInTheDocument();
  });

  it("fades out before removing the mask from the DOM", () => {
    vi.useFakeTimers();
    const { rerender } = render(<LoadingOverlay loading label="加载成交额…" />);

    act(() => vi.advanceTimersByTime(250));
    const overlay = screen.getByTestId("loading-overlay");
    expect(overlay).toHaveAttribute("data-state", "visible");

    rerender(<LoadingOverlay loading={false} label="加载成交额…" />);
    expect(overlay).toHaveAttribute("data-state", "exiting");
    expect(screen.getByRole("status", { name: "加载成交额…" })).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(199));
    expect(screen.getByTestId("loading-overlay")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByTestId("loading-overlay")).not.toBeInTheDocument();
  });
});
