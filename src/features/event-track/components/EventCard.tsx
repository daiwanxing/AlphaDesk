import { Link } from "@tanstack/react-router";
import { Chip } from "@heroui/react";
import clsx from "clsx";
import { useState } from "react";
import { eventDisplayDate } from "../api";
import {
  EARNINGS_STATUS_LABEL,
  EVENT_KIND_LABEL,
  FOMC_STATUS_LABEL,
  formatCardDay,
  formatEarningsTime,
  formatEarningsTitle,
  formatFomcTitleFromDate,
  formatRelativeDay,
  statusChipColor,
} from "../labels";
import type { TimelineEvent } from "../types";
import { fallbackInitials, logoUrlForTicker } from "../logos";

type Props = {
  event: TimelineEvent;
  year: number;
  todayKey: string;
};

export function EventCard({ event, year, todayKey }: Props) {
  const isEarnings = event.kind === "earnings";
  const identity = isEarnings ? event.ticker : "FOMC";
  const logoUrl = isEarnings ? logoUrlForTicker(event.ticker) : null;
  const [logoFailed, setLogoFailed] = useState(false);
  const showLogo = Boolean(logoUrl) && !logoFailed;

  const { title, formChip } = isEarnings
    ? formatEarningsTitle(event.reportPeriodLabel, event.form)
    : { title: formatFomcTitleFromDate(event.meetingEndDate) };

  const typeLabel = EVENT_KIND_LABEL[event.kind];
  const status = isEarnings ? EARNINGS_STATUS_LABEL[event.status] : FOMC_STATUS_LABEL[event.status];
  const time = isEarnings ? formatEarningsTime(event.time) : undefined;
  const dayKey = eventDisplayDate(event);
  const relative = formatRelativeDay(dayKey, todayKey);

  return (
    <Link
      to="/events/$eventId"
      params={{ eventId: event.id }}
      search={{ year }}
      className="event-card-link"
    >
      <article className="event-card-grid">
        <div className="event-card-grid__logo" aria-hidden={!showLogo}>
          {showLogo && logoUrl ? (
            <img
              className="event-card-grid__logo-img"
              src={logoUrl}
              alt=""
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <span
              className={clsx(
                "event-card-grid__logo-fallback",
                !isEarnings && "event-card-grid__logo-fallback--fed",
              )}
            >
              {isEarnings ? fallbackInitials(event.ticker) : "Fed"}
            </span>
          )}
        </div>
        <div className="event-card-grid__title">
          <span className="event-card-grid__ticker">{identity}</span>
          <h3 className="event-card-grid__heading">{title}</h3>
        </div>
        <div className="event-card-grid__meta">
          <Chip size="sm" variant="soft" color={isEarnings ? "accent" : "warning"}>
            <Chip.Label>{typeLabel}</Chip.Label>
          </Chip>
          <Chip size="sm" variant="soft" color={statusChipColor(status)}>
            <Chip.Label>{status}</Chip.Label>
          </Chip>
          {formChip ? (
            <Chip size="sm" variant="soft">
              <Chip.Label>{formChip}</Chip.Label>
            </Chip>
          ) : null}
        </div>
        <div className="event-card-grid__aside">
          <span className="event-card-grid__date">{formatCardDay(dayKey)}</span>
          <span className="event-card-grid__relative">
            {time ? `${relative} · ${time}` : relative}
          </span>
        </div>
      </article>
    </Link>
  );
}
