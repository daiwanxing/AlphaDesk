import { describe, expect, it } from "vitest";

import { createTurnoverRepository, type TurnoverDatabase } from "./repository";

function createMemoryDatabase(): {
  db: TurnoverDatabase;
  documents: Map<string, unknown>;
} {
  const documents = new Map<string, unknown>();
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
              documents.set(key, value);
            },
          };
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
});
