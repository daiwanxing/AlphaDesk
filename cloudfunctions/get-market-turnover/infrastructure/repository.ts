import type { TurnoverPoint } from "../series";

export type PrevEntry = { tradeDate: string; amount: number };

export type TurnoverMeta = {
  _id: "turnover";
  prevBySecId: Record<string, PrevEntry>;
  updatedAt: string;
};

export type IntradayPrevDoc = {
  _id: "turnover_intraday_prev";
  prevTradeDate: string;
  points: TurnoverPoint[];
  updatedAt: string;
};

type TurnoverDocument = {
  get(): Promise<{ data?: unknown[] }>;
  set(data: unknown): Promise<unknown>;
};

export type TurnoverDatabase = {
  collection(name: string): {
    doc(id: string): TurnoverDocument;
  };
};

export type TurnoverRepository = {
  loadTurnoverMeta(): Promise<TurnoverMeta>;
  saveTurnoverMeta(prevBySecId: Record<string, PrevEntry>): Promise<void>;
  loadIntradayPrev(): Promise<IntradayPrevDoc | null>;
  saveIntradayPrev(prevTradeDate: string, points: TurnoverPoint[]): Promise<void>;
};

function nowIso(clock: () => Date): string {
  return clock().toISOString();
}

export function createTurnoverRepository(
  db: TurnoverDatabase,
  clock: () => Date = () => new Date(),
): TurnoverRepository {
  return {
    async loadTurnoverMeta() {
      const res = await db.collection("pipeline_meta").doc("turnover").get();
      const rows = (res.data ?? []) as TurnoverMeta[];
      return rows[0] ?? { _id: "turnover", prevBySecId: {}, updatedAt: "" };
    },

    async saveTurnoverMeta(prevBySecId) {
      await db
        .collection("pipeline_meta")
        .doc("turnover")
        .set({
          _id: "turnover",
          prevBySecId,
          updatedAt: nowIso(clock),
        });
    },

    async loadIntradayPrev() {
      const res = await db.collection("pipeline_meta").doc("turnover_intraday_prev").get();
      const rows = (res.data ?? []) as IntradayPrevDoc[];
      const doc = rows[0];
      if (!doc?.prevTradeDate || !Array.isArray(doc.points) || doc.points.length === 0) {
        return null;
      }
      return doc;
    },

    async saveIntradayPrev(prevTradeDate, points) {
      await db
        .collection("pipeline_meta")
        .doc("turnover_intraday_prev")
        .set({
          _id: "turnover_intraday_prev",
          prevTradeDate,
          points,
          updatedAt: nowIso(clock),
        });
    },
  };
}
