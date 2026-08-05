import type { TurnoverProfileDoc } from "../domain/turnover-profile";
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
  remove(): Promise<unknown>;
};

type TurnoverQuery = {
  orderBy(field: string, direction: "asc" | "desc"): TurnoverQuery;
  limit(n: number): TurnoverQuery;
  get(): Promise<{ data?: unknown[] }>;
};

export type TurnoverDatabase = {
  collection(name: string): {
    doc(id: string): TurnoverDocument;
    orderBy(field: string, direction: "asc" | "desc"): TurnoverQuery;
  };
};

/** 每日收盘量能 profile；与 pipeline_meta 运维缓存分离。 */
const TURNOVER_PROFILES = "turnover_profiles";
const PIPELINE_META = "pipeline_meta";

export type TurnoverRepository = {
  loadTurnoverMeta(): Promise<TurnoverMeta>;
  saveTurnoverMeta(prevBySecId: Record<string, PrevEntry>): Promise<void>;
  loadIntradayPrev(): Promise<IntradayPrevDoc | null>;
  saveIntradayPrev(prevTradeDate: string, points: TurnoverPoint[]): Promise<void>;
  loadTurnoverProfile(tradeDate: string): Promise<TurnoverProfileDoc | null>;
  saveTurnoverProfile(profile: TurnoverProfileDoc): Promise<void>;
  listTurnoverProfiles(limit: number): Promise<TurnoverProfileDoc[]>;
  deleteTurnoverProfilesBefore(tradeDate: string): Promise<number>;
};

function turnoverProfileId(tradeDate: string): string {
  return `turnover_profile_${tradeDate}`;
}

function nowIso(clock: () => Date): string {
  return clock().toISOString();
}

export function createTurnoverRepository(
  db: TurnoverDatabase,
  clock: () => Date = () => new Date(),
): TurnoverRepository {
  return {
    async loadTurnoverMeta() {
      const res = await db.collection(PIPELINE_META).doc("turnover").get();
      const rows = (res.data ?? []) as TurnoverMeta[];
      return rows[0] ?? { _id: "turnover", prevBySecId: {}, updatedAt: "" };
    },

    async saveTurnoverMeta(prevBySecId) {
      await db
        .collection(PIPELINE_META)
        .doc("turnover")
        .set({
          _id: "turnover",
          prevBySecId,
          updatedAt: nowIso(clock),
        });
    },

    async loadIntradayPrev() {
      const res = await db.collection(PIPELINE_META).doc("turnover_intraday_prev").get();
      const rows = (res.data ?? []) as IntradayPrevDoc[];
      const doc = rows[0];
      if (!doc?.prevTradeDate || !Array.isArray(doc.points) || doc.points.length === 0) {
        return null;
      }
      return doc;
    },

    async saveIntradayPrev(prevTradeDate, points) {
      await db
        .collection(PIPELINE_META)
        .doc("turnover_intraday_prev")
        .set({
          _id: "turnover_intraday_prev",
          prevTradeDate,
          points,
          updatedAt: nowIso(clock),
        });
    },

    async loadTurnoverProfile(tradeDate) {
      const res = await db.collection(TURNOVER_PROFILES).doc(turnoverProfileId(tradeDate)).get();
      const rows = (res.data ?? []) as TurnoverProfileDoc[];
      return rows[0] ?? null;
    },

    async saveTurnoverProfile(profile) {
      const id = turnoverProfileId(profile.tradeDate);
      // doc(id).set 已绑定 _id；payload 再带 _id 会报「不能更新_id的值」
      await db
        .collection(TURNOVER_PROFILES)
        .doc(id)
        .set({ ...profile });
    },

    async listTurnoverProfiles(limit) {
      const res = await db
        .collection(TURNOVER_PROFILES)
        .orderBy("tradeDate", "desc")
        .limit(limit)
        .get();
      return (res.data ?? []) as TurnoverProfileDoc[];
    },

    async deleteTurnoverProfilesBefore(tradeDate) {
      const profiles = await db
        .collection(TURNOVER_PROFILES)
        .orderBy("tradeDate", "desc")
        .limit(1000)
        .get();
      const toDelete = ((profiles.data ?? []) as TurnoverProfileDoc[]).filter(
        (profile) => profile.tradeDate < tradeDate,
      );

      await Promise.all(
        toDelete.map((profile) =>
          db.collection(TURNOVER_PROFILES).doc(turnoverProfileId(profile.tradeDate)).remove(),
        ),
      );

      return toDelete.length;
    },
  };
}
