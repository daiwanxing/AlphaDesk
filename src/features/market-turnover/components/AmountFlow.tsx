import NumberFlow, { continuous, NumberFlowGroup } from "@number-flow/react";
import { useEffect, useRef, useState } from "react";
import { amountParts, YI_FORMAT_OPTIONS } from "../format";

const PCT_FORMAT = {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
} as const;

/** Seed 0 only on first paint so NumberFlow has a value change to animate. */
function useFlowValue(target: number): number {
  const primed = useRef(false);
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!primed.current) {
      primed.current = true;
      const id = requestAnimationFrame(() => setValue(target));
      return () => cancelAnimationFrame(id);
    }
    setValue(target);
  }, [target]);

  return value;
}

const FLOW = {
  plugins: [continuous],
  locales: "zh-CN" as const,
  opacityTiming: { duration: 350, easing: "ease-out" } as const,
  spinTiming: { duration: 750, easing: "ease-out" } as const,
  transformTiming: { duration: 750, easing: "ease-out" } as const,
};

type AmountFlowProps = {
  yuan: number;
  className?: string;
};

export function AmountFlow({ yuan, className }: AmountFlowProps) {
  const { value, suffix } = amountParts(yuan);
  return (
    <NumberFlow
      {...FLOW}
      className={className}
      format={YI_FORMAT_OPTIONS}
      suffix={suffix}
      value={useFlowValue(value)}
    />
  );
}

type DeltaFlowProps = {
  delta: number;
  pct: number;
  className?: string;
};

export function DeltaFlow({ delta, pct, className }: DeltaFlowProps) {
  const parts = amountParts(Math.abs(delta));
  const flowAmount = useFlowValue(delta === 0 ? 0 : parts.value);
  const flowPct = useFlowValue(delta === 0 ? 0 : Math.abs(pct) * 100);

  if (delta === 0) {
    return <span className={className}>0 (+0.0%)</span>;
  }

  const sign = delta > 0 ? "+" : "-";
  const pctSign = pct >= 0 ? "+" : "-";

  return (
    <NumberFlowGroup>
      <span className={className}>
        <NumberFlow
          {...FLOW}
          format={YI_FORMAT_OPTIONS}
          prefix={sign}
          suffix={parts.suffix}
          value={flowAmount}
        />
        {" ("}
        <NumberFlow {...FLOW} format={PCT_FORMAT} prefix={pctSign} suffix="%" value={flowPct} />
        {")"}
      </span>
    </NumberFlowGroup>
  );
}
