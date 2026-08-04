import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TurnoverBoard } from "../TurnoverBoard";
import type { MarketTurnoverResponse } from "../../types";
import type { TurnoverInsight } from "@contracts/market-turnover";

vi.mock("../IntradayTurnoverChart", () => ({
  IntradayTurnoverChart: ({ showPrev }: { showPrev: boolean }) => (
    <div data-testid="turnover-chart" data-show-prev={String(showPrev)} />
  ),
}));

const snapshot: MarketTurnoverResponse = {
  ok: true,
  asOf: "2026-07-31T15:00:00+08:00",
  session: "pre_open",
  compareMode: "vs_prev_full_day",
  disclaimer: "休市快照对比",
  markets: [
    {
      id: "sh",
      label: "沪市",
      source: "上证指数",
      amount: 100,
      prevFullDayAmount: 90,
      delta: 10,
      deltaPct: 1 / 9,
    },
  ],
  total: {
    amount: 100,
    prevFullDayAmount: 90,
    prevSameTimeAmount: 90,
    delta: 10,
    deltaPct: 1 / 9,
  },
  series: {
    tradeDate: "2026-07-31",
    prevTradeDate: "2026-07-30",
    today: [{ t: "09:30", v: 10 }],
    prev: [{ t: "09:30", v: 9 }],
  },
};

const activeInsight = {
  status: "active",
  effectiveTime: "2026-08-04T10:30:00+08:00",
  asOf: "2026-08-04T10:30:00+08:00",
  paceState: "contracting",
  paceRatio: 0.86,
  projectedRange: { low: 1_280_000_000_000, high: 1_360_000_000_000 },
  baseline: {
    windowDays: 20,
    sampleDays: 18,
    method: "median_intraday_progress_v1",
    quality: "active",
  },
} satisfies TurnoverInsight;

describe("TurnoverBoard", () => {
  it("shows Shanghai date with weekday for the as-of time", () => {
    render(
      <TurnoverBoard
        data={{ ...snapshot, asOf: "2026-08-03T09:46:59+08:00" }}
        session="continuous"
        loading={false}
        error={null}
        configError={null}
      />,
    );

    const asOf = document.querySelector(".turnover-board__asof");
    expect(asOf).toHaveTextContent("2026-08-03 星期一");
    expect(screen.getByText("开盘中")).toBeInTheDocument();
    expect(asOf).not.toHaveTextContent("更新时间");
  });

  it("shows a historical comparison curve during pre-open when the series exists", () => {
    render(
      <TurnoverBoard
        data={snapshot}
        session="pre_open"
        loading={false}
        error={null}
        configError={null}
      />,
    );

    expect(screen.getByTestId("turnover-chart")).toHaveAttribute("data-show-prev", "true");
  });

  it("does not render insight panel when turnoverInsight is absent", () => {
    render(
      <TurnoverBoard
        data={snapshot}
        session="continuous"
        loading={false}
        error={null}
        configError={null}
      />,
    );

    expect(screen.queryByLabelText("量能节奏")).not.toBeInTheDocument();
  });

  it("renders insight panel copy when turnoverInsight is present", () => {
    render(
      <TurnoverBoard
        data={{ ...snapshot, turnoverInsight: activeInsight }}
        session="continuous"
        loading={false}
        error={null}
        configError={null}
      />,
    );

    expect(screen.getByLabelText("量能节奏")).toBeInTheDocument();
    expect(screen.getByText("温和缩量")).toBeInTheDocument();
    expect(screen.getByText("12,800 – 13,600")).toBeInTheDocument();
    expect(screen.getByText("86%")).toBeInTheDocument();
  });
});
