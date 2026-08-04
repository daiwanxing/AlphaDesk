import { useRef } from "react";
import type { MarketSession, TurnoverInsight } from "@contracts/market-turnover";
import {
  FloatingArrow,
  FloatingPortal,
  arrow,
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
} from "@floating-ui/react";
import { Gauge } from "lucide-react";

import { formatProjectedRangeNums, formatYiGrouped } from "../format";
import { SECTION_TITLE_ICON } from "../icons";
import {
  INSIGHT_PANEL_HEADING,
  PACE_RAIL_MEDIAN_LEFT_PCT,
  hhmmFromEffectiveTime,
  insightPanelCopy,
  paceRailBand,
  paceRailLeftPercent,
  type InsightPanelCopyActive,
} from "../insight-labels";

const TOOLTIP_BG = "#121111";
const ARROW_HEIGHT = 7;
const ARROW_GAP = 3;

function InsightModuleTitle({ as = "h2" }: { as?: "h2" | "span" }) {
  const Tag = as;
  return (
    <Tag className="turnover-insight__module">
      <Gauge {...SECTION_TITLE_ICON} />
      {INSIGHT_PANEL_HEADING}
    </Tag>
  );
}

function InsightCompactStrip({
  statusText,
  detail,
  timeLabel,
}: {
  statusText: string;
  detail: string;
  timeLabel: string;
}) {
  return (
    <section
      className="turnover-insight turnover-insight--compact"
      aria-label={INSIGHT_PANEL_HEADING}
    >
      <div className="turnover-insight__compact-row">
        <div className="turnover-insight__compact-left">
          <InsightModuleTitle as="span" />
          <span className="turnover-insight__compact-status">{statusText}</span>
          <span className="turnover-insight__compact-detail">{detail}</span>
        </div>
        <span className="turnover-insight__compact-time num">{timeLabel}</span>
      </div>
    </section>
  );
}

type TurnoverInsightPanelProps = {
  insight: TurnoverInsight | undefined;
  session?: MarketSession;
};

function rangeHero(insight: TurnoverInsight): { nums: string; unit: string } | null {
  if (insight.projectedRange) {
    return {
      nums: formatProjectedRangeNums(insight.projectedRange.low, insight.projectedRange.high),
      unit: "亿",
    };
  }
  if (insight.projectedFullDayAmount != null) {
    return {
      nums: formatYiGrouped(insight.projectedFullDayAmount),
      unit: "亿",
    };
  }
  return null;
}

function PaceRail({ copy }: { copy: InsightPanelCopyActive }) {
  const tone = `is-${copy.paceTone}`;
  const markerLeft = paceRailLeftPercent(copy.paceRatio);
  const band = paceRailBand(copy.paceRatio);
  const arrowRef = useRef<SVGSVGElement>(null);

  const { refs, floatingStyles, context } = useFloating({
    open: true,
    placement: "top",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(ARROW_HEIGHT + ARROW_GAP),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      arrow({ element: arrowRef }),
    ],
  });

  return (
    <div className="turnover-insight__rail-block">
      <div className="turnover-insight__rail">
        <div className="turnover-insight__rail-track" aria-hidden="true" />
        <div
          className={`turnover-insight__rail-band ${tone}`}
          style={{ left: `${band.left}%`, width: `${band.width}%` }}
          aria-hidden="true"
        />
        <div
          className="turnover-insight__rail-median"
          style={{ left: `${PACE_RAIL_MEDIAN_LEFT_PCT}%` }}
          aria-hidden="true"
        />
        <div
          className={`turnover-insight__rail-marker ${tone}`}
          style={{ left: `${markerLeft}%` }}
          ref={refs.setReference}
          aria-hidden="true"
        />
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            role="tooltip"
            className="turnover-insight__tooltip"
            style={floatingStyles}
          >
            <span className="num">{copy.paceRatioText}</span>
            <FloatingArrow
              ref={arrowRef}
              context={context}
              width={12}
              height={ARROW_HEIGHT}
              fill={TOOLTIP_BG}
            />
          </div>
        </FloatingPortal>
      </div>
      {copy.foot ? <div className="turnover-insight__foot">{copy.foot}</div> : null}
    </div>
  );
}

export function TurnoverInsightPanel({ insight, session }: TurnoverInsightPanelProps) {
  if (!insight) return null;

  const copy = insightPanelCopy(insight, session);
  const lunchTag = session === "lunch" && hhmmFromEffectiveTime(insight.effectiveTime) === "11:30";

  if (copy.status === "warming_up") {
    return (
      <InsightCompactStrip
        statusText={copy.headline}
        detail={copy.detail}
        timeLabel={copy.timeLabel}
      />
    );
  }

  if (copy.status === "unavailable") {
    return (
      <InsightCompactStrip
        statusText={copy.title}
        detail={copy.reasonText}
        timeLabel={copy.timeLabel}
      />
    );
  }

  if (copy.status === "final") {
    return (
      <section
        className="turnover-insight turnover-insight--final"
        aria-label={INSIGHT_PANEL_HEADING}
      >
        <div className="turnover-insight__head">
          <InsightModuleTitle />
          <p className="turnover-insight__status-word is-neutral">{copy.statusWord}</p>
        </div>
        <div className="turnover-insight__final-hero">
          <span className="turnover-insight__final-num num">
            {formatYiGrouped(insight.actualFullDayAmount ?? 0)}
            <span className="turnover-insight__final-unit">亿</span>
          </span>
          <p className="turnover-insight__final-caption">{copy.caption}</p>
        </div>
        {copy.foot ? <div className="turnover-insight__foot">{copy.foot}</div> : null}
      </section>
    );
  }

  const range = rangeHero(insight);
  const tone = `is-${copy.paceTone}`;

  return (
    <section
      className={`turnover-insight${copy.isBootstrap ? " turnover-insight--bootstrap" : ""}`}
      aria-label={INSIGHT_PANEL_HEADING}
      data-tone={copy.paceTone}
    >
      <div className="turnover-insight__head">
        <div className="turnover-insight__head-left">
          <InsightModuleTitle />
          {lunchTag && <span className="turnover-insight__snapshot tag tag--info">午盘快照</span>}
        </div>
        <p className={`turnover-insight__status-word ${tone}`}>{copy.paceLabel}</p>
      </div>

      {range && (
        <div className="turnover-insight__range">
          <span className="turnover-insight__range-nums num">{range.nums}</span>
          <span className="turnover-insight__range-unit">{range.unit}</span>
        </div>
      )}

      <PaceRail copy={copy} />
    </section>
  );
}
