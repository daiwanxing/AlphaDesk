import clsx from "clsx";
import { Link } from "@tanstack/react-router";
import type { TimelineEvent } from "../types";
import { formatDisplayDate } from "../api";

type Props = {
  event: TimelineEvent;
  year: number;
};

export function EventCard({ event, year }: Props) {
  const isEarnings = event.kind === "earnings";
  const date = isEarnings
    ? (event.actualDate ?? event.scheduledDate ?? "")
    : event.meetingEndDate;
  const status = isEarnings
    ? event.status === "disclosed"
      ? "已披露"
      : "待披露"
    : event.status === "held"
      ? "已召开"
      : "待召开";

  return (
    <Link
      to="/events/$eventId"
      params={{ eventId: event.id }}
      search={{ year }}
      className={clsx("event-card", isEarnings ? "event-card--earnings" : "event-card--fomc")}
    >
      <div className="event-card__meta">
        <span className="event-card__type">{isEarnings ? "财报" : "FOMC"}</span>
        <time dateTime={date}>{formatDisplayDate(date)}</time>
      </div>
      <h3 className="event-card__title">
        {isEarnings ? (
          <>
            <span className="event-card__ticker">{event.ticker}</span>
            {event.companyName}
          </>
        ) : (
          <>FOMC · {event.meetingLabel}</>
        )}
      </h3>
      <p className="event-card__sub">
        {isEarnings ? event.reportPeriodLabel : `第 ${event.sequenceInYear} 场`}
      </p>
      <span className={clsx("event-card__status", `event-card__status--${status}`)}>
        {status}
      </span>
    </Link>
  );
}
