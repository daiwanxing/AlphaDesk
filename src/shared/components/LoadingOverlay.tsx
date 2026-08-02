import clsx from "clsx";
import { useEffect, useState } from "react";
import { Loading } from "./Loading";
import "./loading-overlay.scss";

const SHOW_DELAY_MS = 250;
const EXIT_DURATION_MS = 200;

type LoadingPhase = "hidden" | "visible" | "exiting";

export type LoadingOverlayProps = {
  loading: boolean;
  label?: string;
  className?: string;
};

export function LoadingOverlay({ loading, label = "加载中…", className }: LoadingOverlayProps) {
  const [phase, setPhase] = useState<LoadingPhase>("hidden");

  useEffect(() => {
    if (!loading || phase === "visible") return;

    const timer = window.setTimeout(
      () => setPhase("visible"),
      phase === "exiting" ? 0 : SHOW_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [loading, phase]);

  useEffect(() => {
    if (loading || phase !== "visible") return;
    setPhase("exiting");
  }, [loading, phase]);

  useEffect(() => {
    if (loading || phase !== "exiting") return;

    const timer = window.setTimeout(() => setPhase("hidden"), EXIT_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [loading, phase]);

  if (phase === "hidden") return null;

  return (
    <div
      className={clsx("loading-overlay", `loading-overlay--${phase}`, className)}
      data-state={phase}
      data-testid="loading-overlay"
      aria-busy="true"
    >
      <Loading label={label} size="boot" />
    </div>
  );
}
