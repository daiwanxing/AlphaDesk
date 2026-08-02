import clsx from "clsx";
import { motion, useReducedMotion } from "motion/react";
import "./loading.scss";

export type LoadingProps = {
  label?: string;
  tone?: "dark" | "light";
  size?: "inline" | "page" | "boot";
  framed?: boolean;
  className?: string;
};

const brandPath = "M12 43L21 26L30 37L43 16";

export function Loading({
  label = "加载中…",
  tone = "dark",
  size = "page",
  framed = false,
  className,
}: LoadingProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const pathAnimation = shouldReduceMotion
    ? { pathLength: 1, opacity: 0.78 }
    : { pathLength: [0, 1, 1], opacity: [0.2, 1, 0.78] };
  const baseAnimation = shouldReduceMotion ? { opacity: 0.24 } : { opacity: [0.24, 0.34, 0.24] };
  const pathTransition = shouldReduceMotion
    ? { duration: 0 }
    : {
        duration: 1.05,
        ease: [0.16, 1, 0.3, 1] as const,
        times: [0, 0.78, 1],
        repeat: Infinity,
        repeatDelay: 0,
      };

  return (
    <div
      className={clsx(
        "loading",
        `loading--tone-${tone}`,
        `loading--${size}`,
        framed && "loading--framed",
        className,
      )}
      role="status"
      aria-label={label}
      aria-live="polite"
    >
      <svg className="loading__mark" viewBox="0 0 55 55" aria-hidden="true" focusable="false">
        {framed && <rect className="loading__frame" x="0" y="0" width="55" height="55" rx="7" />}
        <motion.path
          className="loading__base"
          d={brandPath}
          strokeWidth={3}
          initial={shouldReduceMotion ? false : { opacity: 0.24 }}
          animate={baseAnimation}
          transition={pathTransition}
        />
        <motion.path
          className="loading__active"
          d={brandPath}
          strokeWidth={3}
          initial={shouldReduceMotion ? false : { pathLength: 0, opacity: 0.2 }}
          animate={pathAnimation}
          transition={pathTransition}
        />
      </svg>
      <span className="loading__label">{label}</span>
    </div>
  );
}
