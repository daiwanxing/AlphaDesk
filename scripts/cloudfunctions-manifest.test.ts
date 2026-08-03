import { loadFunctionManifest, validateFunctionManifest } from "./cloudfunctions-manifest.mjs";

const CURRENT_FUNCTIONS = [
  "detect-new-materials",
  "generate-brief",
  "get-events",
  "get-briefs",
  "get-market-turnover",
  "trigger-backfill",
];

describe("cloud function manifest", () => {
  it("lists every current function exactly once", () => {
    const manifest = loadFunctionManifest();

    expect(validateFunctionManifest(manifest, CURRENT_FUNCTIONS)).toEqual({
      http: ["get-events", "get-briefs", "get-market-turnover", "trigger-backfill"],
      event: ["detect-new-materials", "generate-brief"],
    });
  });

  it("rejects an unknown function entry", () => {
    const manifest = loadFunctionManifest();

    expect(() =>
      validateFunctionManifest(
        {
          ...manifest,
          http: [...manifest.http, "missing-function"],
        },
        CURRENT_FUNCTIONS,
      ),
    ).toThrow("unknown function");
  });
});
