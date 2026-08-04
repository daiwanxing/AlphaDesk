import { useEffect, useRef } from "react";
import { echarts, type EChartsOption } from "@/shared/charts/echarts";
import { formatAmountYi, formatAmountYuan } from "../format";
import { TURNOVER_LABELS } from "../labels";
import { alignSeriesToAxis, buildTradingMinuteLabels } from "../trading-axis";
import type { TurnoverPoint } from "@contracts/market-turnover";

type ChartInstance = ReturnType<typeof echarts.init>;

const AXIS = buildTradingMinuteLabels();
const AXIS_TICKS = new Set(["09:30", "10:30", "11:30", "14:00", "15:00"]);

const LEGEND_PRIMARY = TURNOVER_LABELS.primary;
const LEGEND_PREV = TURNOVER_LABELS.chartPrev;

type ChartTheme = {
  today: string;
  prev: string;
  axis: string;
  split: string;
};

function readTheme(host: HTMLElement): ChartTheme {
  const style = getComputedStyle(host);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;

  return {
    today: token("--chart-today", "#0265ff"),
    prev: token("--chart-prev", "#F99911"),
    axis: token("--chart-axis", "#9ca3af"),
    split: token("--chart-split", "#f0f1f3"),
  };
}

function todayAreaGradient(lineColor: string) {
  return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: withAlpha(lineColor, 0.14) },
    { offset: 1, color: withAlpha(lineColor, 0) },
  ]);
}

function withAlpha(hex: string, alpha: number): string {
  const raw = hex.replace("#", "");
  if (raw.length !== 6) return `rgba(2, 101, 255, ${alpha})`;
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function seriesSignature(today: TurnoverPoint[], prev: TurnoverPoint[], showPrev: boolean): string {
  const finger = (pts: TurnoverPoint[]) => {
    if (pts.length === 0) return "0";
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    return `${pts.length}:${first.t}:${Math.round(first.v)}:${last.t}:${Math.round(last.v)}`;
  };
  return `${finger(today)}|${showPrev ? finger(prev) : "-"}`;
}

type Props = {
  today: TurnoverPoint[];
  prev: TurnoverPoint[];
  showPrev: boolean;
};

function buildOption(theme: ChartTheme, { today, prev, showPrev }: Props): EChartsOption {
  return {
    color: [theme.today, theme.prev],
    grid: { top: 36, right: 16, bottom: 28, left: 64 },
    legend: {
      top: 0,
      right: 0,
      icon: "roundRect",
      itemWidth: 14,
      itemHeight: 3,
      itemGap: 16,
      textStyle: { color: theme.axis, fontSize: 12 },
      data: showPrev ? [LEGEND_PRIMARY, LEGEND_PREV] : [LEGEND_PRIMARY],
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
      valueFormatter: (value) => (value == null ? "—" : formatAmountYuan(Number(value))),
    },
    xAxis: {
      type: "category",
      data: AXIS,
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
        formatter: (value: number) => formatAmountYi(value),
      },
    },
    series: [
      {
        type: "line",
        name: LEGEND_PRIMARY,
        data: alignSeriesToAxis(AXIS, today),
        showSymbol: false,
        connectNulls: true,
        smooth: true,
        areaStyle: { color: todayAreaGradient(theme.today) },
        lineStyle: { color: theme.today, width: 2 },
        itemStyle: { color: theme.today },
      },
      {
        type: "line",
        name: LEGEND_PREV,
        data: showPrev ? alignSeriesToAxis(AXIS, prev) : [],
        showSymbol: false,
        connectNulls: true,
        smooth: true,
        lineStyle: { color: theme.prev, width: 1.5 },
        itemStyle: { color: theme.prev },
      },
    ],
  };
}

export function IntradayTurnoverChart({ today, prev, showPrev }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ChartInstance | null>(null);
  const signature = seriesSignature(today, prev, showPrev);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const chart = echarts.init(host);
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
    chart.setOption(buildOption(readTheme(host), { today, prev, showPrev }), { notMerge: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signature encodes today/prev/showPrev
  }, [signature]);

  return (
    <div className="turnover-chart" ref={hostRef} role="img" aria-label="沪深京合计分时成交额" />
  );
}
