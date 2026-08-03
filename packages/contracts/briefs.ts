export type BriefSlot = "earnings" | "statement" | "minutes" | "sep";

export type BriefStatus =
  | "pending_material"
  | "queued"
  | "processing"
  | "ready"
  | "failed"
  | "failed_exhausted"
  | "not_applicable";

export type BriefSection = {
  id: string;
  heading: string;
  body: string;
};

export type BriefDoc = {
  eventId: string;
  slot: BriefSlot;
  status: BriefStatus;
  sections?: BriefSection[];
  generatedAt?: string;
  sourceUrls?: string[];
  disclaimer?: string;
  errorMessage?: string;
};

export type BriefsResponse = {
  eventId: string;
  briefs: BriefDoc[];
};
