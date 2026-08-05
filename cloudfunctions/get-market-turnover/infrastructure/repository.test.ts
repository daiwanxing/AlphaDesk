import { describe, expect, it } from "vitest";

import type { TurnoverProfileDoc } from "../domain/turnover-profile";
import { createTurnoverRepository, type TurnoverDatabase } from "./repository";

function stubProfile(
  tradeDate: string,
  generatedAt = "2026-08-03T00:00:00.000Z",
): TurnoverProfileDoc {
  return {
    docType: "turnover_profile",
    tradeDate,
    unit: "yuan",
    timeZone: "Asia/Shanghai",
    markets: {} as TurnoverProfileDoc["markets"],
    total: { points: [], fullDayAmount: 0 },
    quality: {
      schemaVersion: 1,
      status: "degraded",
      completeMarkets: [],
      validPointCount: 0,
      expectedPointCount: 241,
      source: "test",
    },
    generatedAt,
  };
}

function createMemoryDatabase(): {
  db: TurnoverDatabase;
  documents: Map<string, unknown>;
} {
  const documents = new Map<string, unknown>();

  function buildQuery(collectionName: string) {
    let orderField: string | undefined;
    let orderDirection: "asc" | "desc" = "asc";
    let maxResults = Number.POSITIVE_INFINITY;

    const query = {
      orderBy(field: string, direction: "asc" | "desc") {
        orderField = field;
        orderDirection = direction;
        return query;
      },
      limit(n: number) {
        maxResults = n;
        return query;
      },
      async get() {
        const prefix = `${collectionName}/`;
        const rows = [...documents.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([, value]) => value as Record<string, unknown>);

        if (orderField) {
          rows.sort((left, right) => {
            const a = String(left[orderField!] ?? "");
            const b = String(right[orderField!] ?? "");
            const cmp = a.localeCompare(b);
            return orderDirection === "desc" ? -cmp : cmp;
          });
        }

        return { data: rows.slice(0, maxResults) };
      },
    };

    return query;
  }

  const db: TurnoverDatabase = {
    collection(name) {
      return {
        doc(id) {
          const key = `${name}/${id}`;
          return {
            async get() {
              const value = documents.get(key);
              return { data: value === undefined ? [] : [value] };
            },
            async set(value) {
              documents.set(key, { ...(value as Record<string, unknown>), _id: id });
            },
            async remove() {
              documents.delete(key);
            },
          };
        },
        orderBy(field, direction) {
          return buildQuery(name).orderBy(field, direction);
        },
      };
    },
  };
  return { db, documents };
}

describe("turnover repository", () => {
  it("returns an empty meta document when the cache is missing", async () => {
    const { db } = createMemoryDatabase();
    const repository = createTurnoverRepository(db);

    await expect(repository.loadTurnoverMeta()).resolves.toEqual({
      _id: "turnover",
      prevBySecId: {},
      updatedAt: "",
    });
  });

  it("persists turnover metadata through the pipeline collection", async () => {
    const { db, documents } = createMemoryDatabase();
    const repository = createTurnoverRepository(db, () => new Date("2026-08-03T02:00:00.000Z"));

    await repository.saveTurnoverMeta({
      "1.000001": { tradeDate: "2026-07-31", amount: 100 },
    });

    expect(documents.get("pipeline_meta/turnover")).toEqual({
      _id: "turnover",
      prevBySecId: {
        "1.000001": { tradeDate: "2026-07-31", amount: 100 },
      },
      updatedAt: "2026-08-03T02:00:00.000Z",
    });
  });

  it("ignores malformed intraday cache documents", async () => {
    const { db, documents } = createMemoryDatabase();
    documents.set("pipeline_meta/turnover_intraday_prev", {
      _id: "turnover_intraday_prev",
      prevTradeDate: "2026-07-31",
      points: [],
      updatedAt: "2026-08-03T02:00:00.000Z",
    });
    const repository = createTurnoverRepository(db);

    await expect(repository.loadIntradayPrev()).resolves.toBeNull();
  });

  it("returns null when a turnover profile is missing", async () => {
    const { db } = createMemoryDatabase();
    const repository = createTurnoverRepository(db);

    await expect(repository.loadTurnoverProfile("2026-08-01")).resolves.toBeNull();
  });

  it("saves turnover profiles idempotently with a stable document id", async () => {
    const { db, documents } = createMemoryDatabase();
    const repository = createTurnoverRepository(db);
    const profile = stubProfile("2026-08-01");

    await repository.saveTurnoverProfile(profile);
    await repository.saveTurnoverProfile({ ...profile, generatedAt: "2026-08-03T01:00:00.000Z" });

    expect(documents.get("turnover_profiles/turnover_profile_2026-08-01")).toEqual({
      _id: "turnover_profile_2026-08-01",
      ...profile,
      generatedAt: "2026-08-03T01:00:00.000Z",
    });
    await expect(repository.loadTurnoverProfile("2026-08-01")).resolves.toEqual({
      _id: "turnover_profile_2026-08-01",
      ...profile,
      generatedAt: "2026-08-03T01:00:00.000Z",
    });
  });

  it("lists turnover profiles in descending trade date order", async () => {
    const { db } = createMemoryDatabase();
    const repository = createTurnoverRepository(db);

    await repository.saveTurnoverProfile(stubProfile("2026-08-01"));
    await repository.saveTurnoverProfile(stubProfile("2026-08-03"));
    await repository.saveTurnoverProfile(stubProfile("2026-08-02"));

    await expect(repository.listTurnoverProfiles(2)).resolves.toEqual([
      expect.objectContaining({ tradeDate: "2026-08-03" }),
      expect.objectContaining({ tradeDate: "2026-08-02" }),
    ]);
  });

  it("deletes turnover profiles before a cutoff date and returns the count", async () => {
    const { db, documents } = createMemoryDatabase();
    const repository = createTurnoverRepository(db);

    await repository.saveTurnoverProfile(stubProfile("2026-08-01"));
    await repository.saveTurnoverProfile(stubProfile("2026-08-02"));
    await repository.saveTurnoverProfile(stubProfile("2026-08-03"));

    await expect(repository.deleteTurnoverProfilesBefore("2026-08-03")).resolves.toBe(2);

    expect(documents.has("turnover_profiles/turnover_profile_2026-08-01")).toBe(false);
    expect(documents.has("turnover_profiles/turnover_profile_2026-08-02")).toBe(false);
    expect(documents.has("turnover_profiles/turnover_profile_2026-08-03")).toBe(true);
  });
});
