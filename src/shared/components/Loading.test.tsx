import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Loading } from "./Loading";

describe("Loading", () => {
  it("renders the approved path animation contract", () => {
    const { container } = render(<Loading label="加载事件追踪…" />);
    const activePath = container.querySelector(".loading__active");

    expect(screen.getByRole("status", { name: "加载事件追踪…" })).toHaveClass(
      "loading--page",
      "loading--tone-dark",
    );
    expect(activePath).toHaveAttribute("d", "M12 43L21 26L30 37L43 16");
    expect(activePath).toHaveAttribute("stroke-width", "3");
    expect(activePath).not.toHaveAttribute("stroke-dasharray", "1");
  });

  it("supports a larger light loader with an optional frame", () => {
    render(<Loading size="boot" tone="light" framed label="同步中…" />);

    expect(screen.getByRole("status", { name: "同步中…" })).toHaveClass(
      "loading--boot",
      "loading--tone-light",
      "loading--framed",
    );
  });
});
