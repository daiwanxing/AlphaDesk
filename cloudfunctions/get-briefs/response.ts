import type {
  BriefDoc,
  BriefSection,
  BriefSlot,
  BriefStatus,
  BriefsResponse,
} from "@contracts/briefs" with { "resolution-mode": "import" };

export type BriefPersistenceDoc = {
  _id?: string;
  eventId: string;
  slot: BriefSlot;
  status: BriefStatus;
  sections?: BriefSection[] | null;
  generatedAt?: string | null;
  sourceUrls?: string[] | null;
  disclaimer?: string | null;
  errorMessage?: string | null;
  [key: string]: unknown;
};

export function toBriefDoc(doc: BriefPersistenceDoc): BriefDoc {
  const result: BriefDoc = {
    eventId: doc.eventId,
    slot: doc.slot,
    status: doc.status,
  };

  if (doc.sections != null) result.sections = doc.sections;
  if (doc.generatedAt != null) result.generatedAt = doc.generatedAt;
  if (doc.sourceUrls != null) result.sourceUrls = doc.sourceUrls;
  if (doc.disclaimer != null) result.disclaimer = doc.disclaimer;
  if (doc.errorMessage != null) result.errorMessage = doc.errorMessage;

  return result;
}

export function toBriefsResponse(
  eventId: string,
  docs: readonly BriefPersistenceDoc[],
): BriefsResponse {
  return {
    eventId,
    briefs: docs.map(toBriefDoc),
  };
}
