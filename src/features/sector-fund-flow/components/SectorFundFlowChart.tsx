import { useEffect, useRef } from "react";
import type { SectorFundFlowSeries } from "@contracts/sector-fund-flow";
import { echarts, type EChartsOption } from "@/shared/charts/echarts";
import { A_SHARE_TRADING_MINUTES, alignSeriesToAxis } from "@/shared/market/trading-axis";
import { formatNetInflowYi, formatNetInflowYiAxis } from "../format";

type ChartInstance = ReturnType<typeof echarts.init>;

const AXIS_TICKS = new Set(["09:30", "10:30", "11:30", "14:00", "15:00"]);

/** Terminal-safe multi-series palette (no purple rainbow). */
const SERIES_COLORS = [
  "#0265ff",
  "#F99911",
  "#0f9d58",
  "#d93025",
  "#5f6368",
  "#00897b",
  "#c2185b",
  "#5c6bc0",
];

type ChartTheme = {
  axis: string;
  split: string;
  zero: string;
};

function readTheme(host: HTMLElement): ChartTheme {
  const style = getComputedStyle(host);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    axis: token("--chart-axis", "#9ca3af"),
    split: token("--chart-split", "#f0f1f3"),
    zero: token("--border", "#e5e7eb"),
  };
}

type Props = {
  sectors: SectorFundFlowSeries[];
};

function buildOption(theme: ChartTheme, sectors: SectorFundFlowSeries[]): EChartsOption {
  return {
    color: SERIES_COLORS,
    grid: { top: 36, right: 12, bottom: 28, left: 56 },
    legend: {
      top: 0,
      type: "scroll",
      icon: "roundRect",
      itemWidth: 12,
      itemHeight: 3,
      itemGap: 12,
      textStyle: { color: theme.axis, fontSize: 11 },
      data: sectors.map((s) => s.name),
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#ffffff",
      borderColor: "#ebebeb",
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: "#1a1a1a", fontSize: 12 },
      axisPointer: {
        type: "line",
        lineStyle: { color: "#d1d5db", width: 1 },
      },
      valueFormatter: (value) => (value == null ? "—" : formatNetInflowYi(Number(value))),
    },
    xAxis: {
      type: "category",
      data: A_SHARE_TRADING_MINUTES,
      boundaryGap: false,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: {
        color: theme.axis,
        fontSize: 11,
        interval: (_index, value) => AXIS_TICKS.has(value),
      },
    },
    yAxis: {
      type: "value",
      scale: true,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: theme.split, type: "solid", width: 1 } },
      axisLabel: {
        color: theme.axis,
        fontSize: 11,
        formatter: (value: number) => formatNetInflowYiAxis(value),
      },
    },
    series: sectors.map((sector) => ({
      name: sector.name,
      type: "line" as const,
      showSymbol: false,
      connectNulls: true,
      smooth: false,
      lineStyle: { width: 1.5 },
      data: alignSeriesToAxis(A_SHARE_TRADING_MINUTES, sector.points),
      markLine:
        sector === sectors[0]
          ? {
              silent: true,
              symbol: "none",
              label: { show: false },
              lineStyle: { color: theme.zero, type: "dashed", width: 1 },
              data: [{ yAxis: 0 }],
            }
          : undefined,
    })),
  };
}

export function SectorFundFlowChart({ sectors }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ChartInstance | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const chart = echarts.init(host, undefined, { renderer: "canvas" });
    chartRef.current = chart;

    let lastW = host.clientWidth;
    let lastH = host.clientHeight;
    let raf = 0;
    const observer = new ResizeObserver(() => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w === lastW && h === lastH) return;
      lastW = w;
      lastH = h;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => chart.resize());
    });
    const listenId = window.setTimeout(() => observer.observe(host), 50);

    return () => {
      window.clearTimeout(listenId);
      cancelAnimationFrame(raf);
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    const chart = chartRef.current;
    if (!host || !chart) return;
    chart.setOption(buildOption(readTheme(host), sectors), { notMerge: true });
  }, [sectors]);

  return (
    <div ref={hostRef} className="sector-flow__chart" role="img" aria-label="板块资金分时图" />
  );
}
