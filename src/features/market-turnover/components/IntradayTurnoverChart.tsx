import { useEffect, useRef } from "react";
import { echarts, type EChartsOption } from "@/shared/charts/echarts";
import { formatAmountYuan } from "../format";
import { alignSeriesToAxis, buildTradingMinuteLabels } from "../trading-axis";
import type { TurnoverPoint } from "../types";

const AXIS = buildTradingMinuteLabels();
const AXIS_TICKS = new Set(["09:30", "10:30", "11:30", "14:00", "15:00"]);
const LUNCH_SPLICE = "13:00";

type ChartTheme = {
  today: string;
  todayFill: string;
  prev: string;
  axis: string;
  split: string;
};

function readTheme(host: HTMLElement): ChartTheme {
  const style = getComputedStyle(host);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;

  return {
    today: token("--chart-today", "#3b6ea8"),
    todayFill: token("--chart-today-fill", "rgba(59, 110, 168, 0.15)"),
    prev: token("--chart-prev", "#e6a23c"),
    axis: token("--muted", "#999999"),
    split: token("--border", "#e0e0e0"),
  };
}

type Props = {
  today: TurnoverPoint[];
  prev: TurnoverPoint[];
  primaryLabel: string;
  prevLabel: string;
  showPrev: boolean;
};

function buildOption(
  theme: ChartTheme,
  { today, prev, primaryLabel, prevLabel, showPrev }: Props,
): EChartsOption {
  const monoFont = "ui-monospace, Menlo, monospace";

  return {
    animationDuration: 400,
    grid: { top: 16, right: 12, bottom: 24, left: 56 },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#ffffff",
      borderColor: theme.split,
      borderWidth: 1,
      padding: [6, 10],
      textStyle: { color: "#121111", fontSize: 12, fontFamily: monoFont },
      valueFormatter: (value) => (value == null ? "—" : formatAmountYuan(Number(value))),
    },
    xAxis: {
      type: "category",
      data: AXIS,
      boundaryGap: false,
      axisLine: { lineStyle: { color: theme.split } },
      axisTick: { show: false },
      axisLabel: {
        color: theme.axis,
        fontSize: 11,
        fontFamily: monoFont,
        interval: (_index, value) => AXIS_TICKS.has(value),
      },
    },
    yAxis: {
      type: "value",
      scale: true,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: theme.split, type: "dashed" } },
      axisLabel: {
        color: theme.axis,
        fontSize: 11,
        fontFamily: monoFont,
        formatter: (value: number) => formatAmountYuan(value),
      },
    },
    series: [
      {
        type: "line",
        name: primaryLabel,
        data: alignSeriesToAxis(AXIS, today),
        showSymbol: false,
        lineStyle: { color: theme.today, width: 1.5 },
        itemStyle: { color: theme.today },
        areaStyle: { color: theme.todayFill },
        markLine: {
          silent: true,
          symbol: "none",
          label: { show: false },
          lineStyle: { color: theme.split, type: "dashed", width: 1 },
          data: [{ xAxis: LUNCH_SPLICE }],
        },
      },
      {
        type: "line",
        name: prevLabel,
        data: showPrev ? alignSeriesToAxis(AXIS, prev) : [],
        showSymbol: false,
        lineStyle: { color: theme.prev, width: 1.5 },
        itemStyle: { color: theme.prev },
      },
    ],
  };
}

export function IntradayTurnoverChart({ today, prev, primaryLabel, prevLabel, showPrev }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const chart = echarts.init(host);
    chartRef.current = chart;

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(host);

    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    const chart = chartRef.current;
    if (!host || !chart) return;

    chart.setOption(
      buildOption(readTheme(host), { today, prev, primaryLabel, prevLabel, showPrev }),
    );
  }, [today, prev, primaryLabel, prevLabel, showPrev]);

  return (
    <div className="turnover-chart" ref={hostRef} role="img" aria-label="沪深京合计分时成交额" />
  );
}
