import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TurnoverInsight } from "@contracts/market-turnover";

import { TurnoverInsightPanel } from "../TurnoverInsightPanel";

const baseInsight = {
  effectiveTime: "2026-08-04T10:30:00+08:00",
  asOf: "2026-08-04T10:30:00+08:00",
} satisfies Pick<TurnoverInsight, "effectiveTime" | "asOf">;

describe("TurnoverInsightPanel", () => {
  it("renders nothing when insight is undefined", () => {
    const { container } = render(<TurnoverInsightPanel insight={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows pre_open warming_up as compact strip", () => {
    render(
      <TurnoverInsightPanel
        session="pre_open"
        insight={{
          effectiveTime: "2026-08-04T08:10:00+08:00",
          asOf: "2026-08-04T08:10:00+08:00",
          status: "warming_up",
        }}
      />,
    );

    expect(screen.getByLabelText("量能节奏")).toBeInTheDocument();
    expect(screen.getByText("09:45 后可用")).toBeInTheDocument();
    expect(screen.getByText("开盘后对比近期典型节奏")).toBeInTheDocument();
    expect(screen.getByText("截至 08:10")).toBeInTheDocument();
  });

  it("shows early continuous warming_up copy", () => {
    render(
      <TurnoverInsightPanel
        session="continuous"
        insight={{
          effectiveTime: "2026-08-04T09:40:00+08:00",
          asOf: "2026-08-04T09:40:00+08:00",
          status: "warming_up",
        }}
      />,
    );

    expect(screen.getByText("开盘初期")).toBeInTheDocument();
    expect(screen.getByText("截至 09:40")).toBeInTheDocument();
  });

  it("shows unavailable copy with reason", () => {
    render(
      <TurnoverInsightPanel
        insight={{
          ...baseInsight,
          status: "unavailable",
          reason: "insufficient_shape_days",
        }}
      />,
    );

    expect(screen.getByText("预测暂不可用")).toBeInTheDocument();
    expect(screen.getByText("形状样本不足（少于 2 个交易日）")).toBeInTheDocument();
    expect(screen.getByText("截至 10:30")).toBeInTheDocument();
  });

  it("shows active scheme-B hierarchy with rail", () => {
    const { container } = render(
      <TurnoverInsightPanel
        insight={{
          ...baseInsight,
          status: "active",
          paceState: "contracting",
          paceRatio: 0.86,
          projectedRange: { low: 1_280_000_000_000, high: 1_360_000_000_000 },
          baseline: {
            windowDays: 20,
            sampleDays: 18,
            method: "median_intraday_progress_v1",
            quality: "active",
          },
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "量能节奏" })).toBeInTheDocument();
    expect(screen.queryByText("历史节奏参考")).not.toBeInTheDocument();
    expect(screen.getByText("温和缩量")).toBeInTheDocument();
    expect(
      document.querySelector(".turnover-insight__head .turnover-insight__status-word"),
    ).toHaveTextContent("温和缩量");
    expect(screen.getByText("12,800 – 13,600")).toBeInTheDocument();
    expect(screen.getByText("亿")).toBeInTheDocument();
    expect(screen.getByRole("tooltip")).toHaveTextContent("86%");
    expect(screen.queryByText("低于近 20 日同刻中位数")).not.toBeInTheDocument();
    expect(screen.getByText("尺度 20 日K · n=18")).toBeInTheDocument();
    expect(container.querySelector(".turnover-insight__rail-marker.is-low")).toBeTruthy();
  });

  it("keeps pace percent tooltip always visible", async () => {
    render(
      <TurnoverInsightPanel
        insight={{
          ...baseInsight,
          status: "active",
          paceState: "contracting",
          paceRatio: 0.86,
          projectedRange: { low: 1_280_000_000_000, high: 1_360_000_000_000 },
          baseline: {
            windowDays: 20,
            sampleDays: 18,
            method: "median_intraday_progress_v1",
            quality: "active",
          },
        }}
      />,
    );

    await act(async () => {});
    expect(screen.getByRole("tooltip")).toHaveTextContent("86%");
  });

  it("marks bootstrap with dashed rail class", () => {
    const { container } = render(
      <TurnoverInsightPanel
        insight={{
          ...baseInsight,
          status: "active",
          paceState: "expanding",
          paceRatio: 1.12,
          projectedRange: { low: 1_420_000_000_000, high: 1_510_000_000_000 },
          baseline: {
            windowDays: 20,
            sampleDays: 3,
            shapeDays: 3,
            scaleDays: 20,
            method: "kline_scale_short_shape_v1",
            quality: "bootstrap",
          },
        }}
      />,
    );

    expect(container.querySelector(".turnover-insight--bootstrap")).toBeTruthy();
    expect(screen.getByText("样本较少", { exact: false })).toBeInTheDocument();
  });

  it("shows final copy without rail", () => {
    const { container } = render(
      <TurnoverInsightPanel
        insight={{
          ...baseInsight,
          status: "final",
          actualFullDayAmount: 2_560_000_000_000,
        }}
      />,
    );

    expect(screen.getByText("收盘")).toBeInTheDocument();
    expect(screen.getByText("25,600")).toBeInTheDocument();
    expect(screen.getByText("全天实际成交额 · 无轨 · 无五档染色")).toBeInTheDocument();
    expect(container.querySelector(".turnover-insight__rail")).toBeNull();
  });

  it("shows lunch snapshot tag when session is lunch and time is 11:30", () => {
    render(
      <TurnoverInsightPanel
        session="lunch"
        insight={{
          ...baseInsight,
          effectiveTime: "2026-08-04T11:30:00+08:00",
          status: "active",
          paceState: "normal",
          paceRatio: 1,
          projectedRange: { low: 1_000_000_000_000, high: 1_100_000_000_000 },
          baseline: {
            windowDays: 20,
            sampleDays: 20,
            method: "median_intraday_progress_v1",
            quality: "mature",
          },
        }}
      />,
    );

    expect(screen.getByText("午盘快照")).toBeInTheDocument();
  });

  it("does not show lunch snapshot tag outside lunch session", () => {
    render(
      <TurnoverInsightPanel
        session="continuous"
        insight={{
          ...baseInsight,
          effectiveTime: "2026-08-04T11:30:00+08:00",
          status: "warming_up",
        }}
      />,
    );

    expect(screen.queryByText("午盘快照")).not.toBeInTheDocument();
  });
});
