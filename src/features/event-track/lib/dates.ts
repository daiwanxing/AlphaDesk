import type { TimelineResponse } from "@contracts/event-track";

export function eventDisplayDate(event: TimelineResponse["events"][number]): string {
  if (event.kind === "earnings") {
    return event.actualDate ?? event.scheduledDate ?? "9999-12-31";
  }
  return event.meetingEndDate;
}

export function formatDisplayDate(iso: string): string {
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
