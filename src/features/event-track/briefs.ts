import type {
  BriefDoc,
  BriefSlot,
  FomcEvent,
  ProductBriefCardState,
  TimelineEvent,
} from "./types";

export type BriefCard = {
  slot: BriefSlot;
  state: ProductBriefCardState;
};

export function slotsForEvent(kind: TimelineEvent["kind"]): BriefSlot[] {
  if (kind === "earnings") return ["earnings"];
  return ["statement", "minutes", "sep"];
}

/** 材料含 sep 条目则为 true；已召开且无 sep → 本场无 SEP */
export function deriveHasSep(event: FomcEvent): boolean | "unknown" {
  if (event.materials.some((m) => m.kind === "sep")) return true;
  if (event.status === "held") return false;
  return "unknown";
}

export function isMaterialPublished(event: TimelineEvent, slot: BriefSlot): boolean {
  if (event.kind === "earnings") {
    return event.status === "disclosed";
  }
  if (slot === "sep") {
    const hasSep = deriveHasSep(event);
    if (hasSep === false) return false;
  }
  return event.materials.some((m) => m.kind === slot && m.published);
}

export function resolveBriefCardState(input: {
  slot: BriefSlot;
  brief: BriefDoc | undefined;
  materialPublished: boolean;
  /** sep 槽：false 表示本场无 SEP */
  hasSep?: boolean | "unknown";
}): ProductBriefCardState {
  const { slot, brief, materialPublished, hasSep } = input;

  if (slot === "sep" && hasSep === false) {
    return { kind: "not_applicable" };
  }

  if (brief?.status === "not_applicable") {
    return { kind: "not_applicable" };
  }

  if (!materialPublished) {
    return { kind: "placeholder" };
  }

  if (brief?.status === "ready") {
    return { kind: "ready", brief };
  }

  if (brief?.status === "failed_exhausted") {
    return { kind: "failed", retrying: false, message: brief.errorMessage };
  }

  if (brief?.status === "failed") {
    return { kind: "failed", retrying: true, message: brief.errorMessage };
  }

  if (brief?.status === "queued" || brief?.status === "processing") {
    return { kind: "writing" };
  }

  // 材料已出但尚无 brief 行 → 撰写中
  return { kind: "writing" };
}

export function mergeBriefCards(
  event: TimelineEvent,
  briefs: BriefDoc[],
  options?: { briefsFetchFailed?: boolean },
): BriefCard[] {
  const slots = slotsForEvent(event.kind);
  const bySlot = new Map(briefs.filter((b) => b.eventId === event.id).map((b) => [b.slot, b]));

  if (options?.briefsFetchFailed) {
    return slots.map((slot) => ({ slot, state: { kind: "unavailable" as const } }));
  }

  const hasSep = event.kind === "fomc" ? deriveHasSep(event) : undefined;

  return slots.map((slot) => ({
    slot,
    state: resolveBriefCardState({
      slot,
      brief: bySlot.get(slot),
      materialPublished: isMaterialPublished(event, slot),
      hasSep,
    }),
  }));
}
