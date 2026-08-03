import cloudbase from "@cloudbase/node-sdk";
import { fetchSourceForJob } from "./fetch-source";
import { generateSectionsWithDeepSeek } from "./llm";
import {
  defaultDisclaimer,
  inferEventKind,
  inferTicker,
  mockSections,
  promptVersionForSlot,
  type BriefSection,
  type BriefSlot,
} from "./prompts";

const ENV_ID = process.env.TCB_ENV || process.env.SCF_NAMESPACE || "trader-d4gl4d7a1cb6baebb";

const LOCK_TTL_MS = 15 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 5;
/** attempts 失败后的退避（第 1…5 次失败） */
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];

type JobDoc = {
  _id: string;
  eventId: string;
  slot: BriefSlot;
  sourceFingerprint: string;
  sourceUrls?: string[];
  /** 可选：预置原文（出口受限或调试） */
  sourceText?: string;
  status: string;
  attempts?: number;
  maxAttempts?: number;
  nextRunAt?: string;
  lockedAt?: string;
  lockOwner?: string;
  lastError?: string;
  year?: number;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
};

type GenerateEvent = {
  jobId?: string;
  /** 单次最多处理条数，默认 1 */
  limit?: number;
};

type GenerateContext = {
  request_id?: string;
  requestId?: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function requestIdOf(context: GenerateContext): string {
  return context.request_id ?? context.requestId ?? `local-${Date.now()}`;
}

function dbOf() {
  const app = cloudbase.init({ env: ENV_ID });
  return app.database();
}

type Db = ReturnType<typeof dbOf>;
type DbCommand = Db["command"];

function backoffMs(attemptsAfterFail: number): number {
  const idx = Math.min(Math.max(attemptsAfterFail, 1), BACKOFF_MS.length) - 1;
  return BACKOFF_MS[idx]!;
}

/** 锁过期的 processing → queued */
async function reclaimStaleLocks(db: Db, _: DbCommand): Promise<number> {
  const cutoff = new Date(Date.now() - LOCK_TTL_MS).toISOString();
  const stale = await db
    .collection("jobs")
    .where({
      status: "processing",
      lockedAt: _.lt(cutoff),
    })
    .limit(20)
    .get();

  let n = 0;
  const ts = nowIso();
  for (const row of (stale.data ?? []) as JobDoc[]) {
    const r = await db.collection("jobs").where({ _id: row._id, status: "processing" }).update({
      status: "queued",
      lockedAt: _.remove(),
      lockOwner: _.remove(),
      updatedAt: ts,
      lastError: "lock expired; requeued",
    });
    n += r.updated ?? 0;
  }
  return n;
}

async function pickJobs(
  db: Db,
  _: DbCommand,
  event: GenerateEvent,
  limit: number,
): Promise<JobDoc[]> {
  if (event.jobId) {
    const one = await db.collection("jobs").doc(event.jobId).get();
    const data = (one.data ?? []) as JobDoc[];
    return data[0] ? [data[0]] : [];
  }

  const ts = nowIso();
  const res = await db
    .collection("jobs")
    .where({
      status: "queued",
      nextRunAt: _.lte(ts),
    })
    .orderBy("nextRunAt", "asc")
    .limit(limit)
    .get();
  return (res.data ?? []) as JobDoc[];
}

async function claimJob(db: Db, job: JobDoc, owner: string): Promise<boolean> {
  const ts = nowIso();
  // 指定 jobId 时允许从 queued 或锁过期后的 queued 领取；processing 且未过期则跳过
  if (job.status === "processing") {
    const lockedAt = job.lockedAt ? Date.parse(job.lockedAt) : 0;
    if (Number.isFinite(lockedAt) && Date.now() - lockedAt < LOCK_TTL_MS) {
      return false;
    }
  } else if (job.status !== "queued") {
    return false;
  }

  const r = await db
    .collection("jobs")
    .where({
      _id: job._id,
      status: job.status === "processing" ? "processing" : "queued",
    })
    .update({
      status: "processing",
      lockedAt: ts,
      lockOwner: owner,
      updatedAt: ts,
    });
  return (r.updated ?? 0) > 0;
}

async function buildSections(
  job: JobDoc,
): Promise<{ sections: BriefSection[]; model: string; sourceUrls: string[] }> {
  // 无 key 时退回 mock（本地/未配置）
  if (!process.env.DEEPSEEK_API_KEY) {
    return {
      sections: mockSections(job.slot),
      model: "mock",
      sourceUrls: job.sourceUrls ?? [],
    };
  }

  const fetched = await fetchSourceForJob(job);
  console.warn("[generate-brief] source fetched", job.eventId, job.slot, fetched.charCount);
  const llm = await generateSectionsWithDeepSeek({
    slot: job.slot,
    sourceText: fetched.text,
  });
  const urls = [...(job.sourceUrls ?? [])];
  if (fetched.sourceUrl && !urls.includes(fetched.sourceUrl)) {
    urls.unshift(fetched.sourceUrl);
  }
  return { sections: llm.sections, model: llm.model, sourceUrls: urls };
}

async function writeBriefReady(
  db: Db,
  job: JobDoc,
  built: { sections: BriefSection[]; model: string; sourceUrls: string[] },
): Promise<void> {
  const ts = nowIso();
  const slot = job.slot;
  const briefId = `${job.eventId}__${slot}`;
  const eventKind = inferEventKind(job.eventId);
  const ticker = inferTicker(job.eventId);
  const year = job.year ?? new Date().getFullYear();

  const doc = {
    eventId: job.eventId,
    eventKind,
    slot,
    year,
    ...(ticker ? { ticker } : {}),
    status: "ready",
    title: job.title ?? `${slot} brief`,
    sections: built.sections,
    disclaimer: defaultDisclaimer(),
    sourceFingerprint: job.sourceFingerprint,
    sourceUrls: built.sourceUrls,
    model: built.model,
    promptVersion: promptVersionForSlot(slot),
    generatedAt: ts,
    errorMessage: null,
    updatedAt: ts,
    createdAt: ts,
  };

  await db.collection("briefs").doc(briefId).set(doc);
}

async function markJobSucceeded(db: Db, _: DbCommand, jobId: string): Promise<void> {
  const ts = nowIso();
  await db.collection("jobs").doc(jobId).update({
    status: "succeeded",
    lockedAt: _.remove(),
    lockOwner: _.remove(),
    lastError: _.remove(),
    updatedAt: ts,
  });
}

async function markJobFailed(
  db: Db,
  _: DbCommand,
  job: JobDoc,
  errMsg: string,
): Promise<{ exhausted: boolean }> {
  const ts = nowIso();
  const attempts = (job.attempts ?? 0) + 1;
  const maxAttempts = job.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const exhausted = attempts >= maxAttempts;
  const nextRunAt = exhausted ? ts : new Date(Date.now() + backoffMs(attempts)).toISOString();

  await db
    .collection("jobs")
    .doc(job._id)
    .update({
      status: exhausted ? "failed" : "queued",
      attempts,
      nextRunAt,
      lastError: errMsg,
      lockedAt: _.remove(),
      lockOwner: _.remove(),
      updatedAt: ts,
    });

  const briefId = `${job.eventId}__${job.slot}`;
  const briefStatus = exhausted ? "failed_exhausted" : "failed";
  await db
    .collection("briefs")
    .doc(briefId)
    .set({
      eventId: job.eventId,
      eventKind: inferEventKind(job.eventId),
      slot: job.slot,
      year: job.year ?? new Date().getFullYear(),
      ...(inferTicker(job.eventId) ? { ticker: inferTicker(job.eventId) } : {}),
      status: briefStatus,
      errorMessage: errMsg,
      sourceFingerprint: job.sourceFingerprint,
      sourceUrls: job.sourceUrls ?? [],
      disclaimer: defaultDisclaimer(),
      updatedAt: ts,
      createdAt: ts,
    });

  return { exhausted };
}

async function processOne(
  db: Db,
  _: DbCommand,
  job: JobDoc,
  owner: string,
): Promise<{ jobId: string; ok: boolean; error?: string }> {
  const claimed = await claimJob(db, job, owner);
  if (!claimed) {
    return { jobId: job._id, ok: false, error: "claim failed" };
  }

  // 刷新 attempts 等字段
  const fresh = await db.collection("jobs").doc(job._id).get();
  const current = ((fresh.data ?? []) as JobDoc[])[0] ?? job;

  try {
    const built = await buildSections(current);
    await writeBriefReady(db, current, built);
    await markJobSucceeded(db, _, current._id);
    console.warn(
      "[generate-brief] succeeded",
      current._id,
      current.eventId,
      current.slot,
      built.model,
    );
    return { jobId: current._id, ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-brief] failed", current._id, message);
    await markJobFailed(db, _, current, message);
    return { jobId: current._id, ok: false, error: message };
  }
}

/** Event Function：领取 jobs → 抓原文 + DeepSeek（无 key 则 mock）→ briefs=ready */
export async function main(event: GenerateEvent = {}, context: GenerateContext = {}) {
  const owner = requestIdOf(context);
  const db = dbOf();
  const _ = db.command;
  const limit = Math.min(Math.max(event.limit ?? 1, 1), 3);

  const reclaimed = await reclaimStaleLocks(db, _);
  const jobs = await pickJobs(db, _, event, limit);

  if (jobs.length === 0) {
    return {
      ok: true,
      processed: 0,
      reclaimed,
      message: "no queued jobs",
      requestId: owner,
    };
  }

  const results = [];
  for (const job of jobs) {
    results.push(await processOne(db, _, job, owner));
  }

  return {
    ok: results.every((r) => r.ok),
    processed: results.length,
    reclaimed,
    results,
    requestId: owner,
  };
}
