/**
 * Event Function：窗口检测 → 入队 → 唤醒 generate-brief。
 *
 * 节奏（日常只跑当前年；历史年走 trigger-backfill）：
 * - Timer 仍可每 30min 唤醒；窗外无周兜底到期时 idle 早退，不打 SEC/Fed
 * - 日程一年基本固定：默认约 7 天刷新一次（DETECT_SCHEDULE_CACHE_MS）
 * - 无活跃窗口时的日常全量兜底：默认约 7 天一次（DETECT_DAILY_HOURS）
 * - 加密窗内 dense：及时发现新披露并入队；有 job 才 invoke generate-brief
 */
import cloudbase from "@cloudbase/node-sdk";
import { resolveDetectMode, type DetectMode } from "./detect-windows";
import {
  computeActiveWindows,
  fetchSchedule,
  type BriefRow,
  type ScheduleSnapshot,
  type SlimEarnings,
  type SlimEvent,
  type SlimFomc,
} from "./schedule";

const ENV_ID = process.env.TCB_ENV || process.env.SCF_NAMESPACE || "trader-d4gl4d7a1cb6baebb";

/** 无活跃窗口时，距上次 daily 兜底多久再扫当年（默认 7 天）。 */
const DAILY_INTERVAL_HOURS = Number(process.env.DETECT_DAILY_HOURS || 168);
/** 日程快照缓存 TTL（默认 7 天）；可用 env 覆盖。 */
const SCHEDULE_CACHE_MAX_AGE_MS = Number(
  process.env.DETECT_SCHEDULE_CACHE_MS || 7 * 24 * 60 * 60 * 1000,
);
const MAX_ENQUEUE = Number(process.env.DETECT_MAX_ENQUEUE || 25);

type DetectEvent = {
  year?: number;
  mode?: DetectMode;
};

type DetectContext = {
  request_id?: string;
  requestId?: string;
};

type PipelineMeta = {
  _id?: string;
  lastDailyAt?: string | null;
  scheduleByYear?: Record<string, ScheduleSnapshot>;
};

function nowIso() {
  return new Date().toISOString();
}

function dbOf() {
  return cloudbase.init({ env: ENV_ID }).database();
}

function appOf() {
  return cloudbase.init({ env: ENV_ID });
}

function fingerprintEarnings(ev: SlimEarnings): string {
  return `sec-${(ev.accessionNumber ?? "").replace(/-/g, "")}`;
}

function fingerprintFomc(ev: SlimFomc, slot: string, url: string): string {
  return `fed-${ev.id}-${slot}-${url.slice(-48)}`;
}

function jobIdOf(eventId: string, slot: string, fingerprint: string): string {
  const safe = fingerprint.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  return `job_${eventId}_${slot}_${safe}`.slice(0, 128);
}

async function loadMeta(db: ReturnType<typeof dbOf>): Promise<PipelineMeta> {
  const res = await db.collection("pipeline_meta").doc("detect").get();
  const rows = (res.data ?? []) as PipelineMeta[];
  return rows[0] ?? { _id: "detect", lastDailyAt: null, scheduleByYear: {} };
}

async function saveMeta(db: ReturnType<typeof dbOf>, patch: PipelineMeta): Promise<void> {
  const prev = await loadMeta(db);
  const { _id: _ignored, ...prevRest } = prev;
  await db
    .collection("pipeline_meta")
    .doc("detect")
    .set({
      ...prevRest,
      ...patch,
      scheduleByYear: {
        ...(prev.scheduleByYear ?? {}),
        ...(patch.scheduleByYear ?? {}),
      },
      updatedAt: nowIso(),
    });
}

async function loadBriefsForYear(db: ReturnType<typeof dbOf>, year: number): Promise<BriefRow[]> {
  const res = await db.collection("briefs").where({ year }).limit(1000).get();
  return (res.data ?? []) as BriefRow[];
}

async function ensureSchedule(
  db: ReturnType<typeof dbOf>,
  meta: PipelineMeta,
  year: number,
  forceRefresh: boolean,
): Promise<{ snapshot: ScheduleSnapshot; fetchedExternal: boolean }> {
  const cached = meta.scheduleByYear?.[String(year)];
  const fresh = cached && Date.now() - Date.parse(cached.fetchedAt) < SCHEDULE_CACHE_MAX_AGE_MS;
  if (!forceRefresh && fresh && cached) {
    return { snapshot: cached, fetchedExternal: false };
  }
  const snapshot = await fetchSchedule(year);
  await saveMeta(db, {
    scheduleByYear: { [String(year)]: snapshot },
  });
  return { snapshot, fetchedExternal: true };
}

type EnqueueItem = {
  eventId: string;
  slot: string;
  sourceFingerprint: string;
  sourceUrls: string[];
  year: number;
  title: string;
};

function collectEnqueueTargets(
  events: SlimEvent[],
  briefs: BriefRow[],
  opts: { onlyEventIds?: Set<string> },
): EnqueueItem[] {
  const byKey = new Map<string, BriefRow>(briefs.map((b) => [`${b.eventId}__${b.slot}`, b]));
  const out: EnqueueItem[] = [];

  for (const ev of events) {
    if (opts.onlyEventIds && !opts.onlyEventIds.has(ev.id)) continue;

    if (ev.kind === "earnings") {
      if (ev.id.startsWith("earnings-pending-") || ev.status !== "disclosed") continue;
      const fp = fingerprintEarnings(ev);
      const key = `${ev.id}__earnings`;
      const existing = byKey.get(key);
      if (existing?.status === "ready" && existing.sourceFingerprint === fp) continue;
      // 已有同指纹 queued/processing 也跳过
      if (
        existing &&
        existing.sourceFingerprint === fp &&
        (existing.status === "queued" || existing.status === "processing")
      ) {
        continue;
      }
      out.push({
        eventId: ev.id,
        slot: "earnings",
        sourceFingerprint: fp,
        sourceUrls: [ev.irUrl, ev.edgarUrl].filter(Boolean) as string[],
        year: ev.year,
        title: `${ev.ticker} ${ev.accessionNumber ?? ""}`.trim(),
      });
      continue;
    }

    // FOMC：无 SEP → not_applicable 由调用方写库；此处只入队已发布槽位
    for (const slot of ["statement", "minutes", "sep"] as const) {
      if (slot === "sep" && !ev.hasSep) continue;
      const mat = ev.materials.find((m) => m.kind === slot && m.published);
      if (!mat) continue;
      const fp = fingerprintFomc(ev, slot, mat.url);
      const key = `${ev.id}__${slot}`;
      const existing = byKey.get(key);
      if (existing?.status === "ready" && existing.sourceFingerprint === fp) continue;
      if (
        existing &&
        existing.sourceFingerprint === fp &&
        (existing.status === "queued" || existing.status === "processing")
      ) {
        continue;
      }
      out.push({
        eventId: ev.id,
        slot,
        sourceFingerprint: fp,
        sourceUrls: [mat.url],
        year: ev.year,
        title: `${ev.id} ${slot}`,
      });
    }
  }

  return out.slice(0, MAX_ENQUEUE);
}

async function writeNotApplicableSep(
  db: ReturnType<typeof dbOf>,
  events: SlimEvent[],
): Promise<number> {
  let n = 0;
  const ts = nowIso();
  for (const ev of events) {
    if (ev.kind !== "fomc" || ev.hasSep) continue;
    const briefId = `${ev.id}__sep`;
    await db
      .collection("briefs")
      .doc(briefId)
      .set({
        eventId: ev.id,
        eventKind: "fomc",
        slot: "sep",
        year: ev.year,
        status: "not_applicable",
        disclaimer: "AI 生成 · 非正式官方文件",
        sourceFingerprint: `fed-${ev.id}-sep-na`,
        sourceUrls: [],
        updatedAt: ts,
        createdAt: ts,
      });
    n += 1;
  }
  return n;
}

async function enqueueJobs(db: ReturnType<typeof dbOf>, items: EnqueueItem[]): Promise<string[]> {
  const ts = nowIso();
  const jobIds: string[] = [];
  for (const item of items) {
    const jid = jobIdOf(item.eventId, item.slot, item.sourceFingerprint);
    const briefId = `${item.eventId}__${item.slot}`;
    await db.collection("jobs").doc(jid).set({
      eventId: item.eventId,
      slot: item.slot,
      sourceFingerprint: item.sourceFingerprint,
      sourceUrls: item.sourceUrls,
      status: "queued",
      attempts: 0,
      maxAttempts: 5,
      nextRunAt: ts,
      year: item.year,
      title: item.title,
      createdAt: ts,
      updatedAt: ts,
    });
    await db
      .collection("briefs")
      .doc(briefId)
      .set({
        eventId: item.eventId,
        eventKind: item.eventId.startsWith("fomc-") ? "fomc" : "earnings",
        slot: item.slot,
        year: item.year,
        status: "queued",
        sourceFingerprint: item.sourceFingerprint,
        sourceUrls: item.sourceUrls,
        disclaimer: "AI 生成 · 非正式官方文件",
        updatedAt: ts,
        createdAt: ts,
      });
    jobIds.push(jid);
  }
  return jobIds;
}

/** Event Function：窗口检测 → 入队 → 唤醒 generate-brief */
export async function main(event: DetectEvent = {}, context: DetectContext = {}) {
  const requestId = context.request_id ?? context.requestId ?? `local-${Date.now()}`;
  const year = event.year ?? new Date().getFullYear();
  const forcedMode = event.mode;
  const db = dbOf();
  const today = new Date().toISOString().slice(0, 10);
  const now = nowIso();

  let meta = await loadMeta(db);
  const briefs = await loadBriefsForYear(db, year);

  const needForceFetch =
    forcedMode === "daily" || forcedMode === "backfill" || forcedMode === "dense";

  // 优先用新鲜缓存判断 idle，避免无窗口时仍打 SEC/Fed
  if (!needForceFetch) {
    const cached = meta.scheduleByYear?.[String(year)];
    const cacheFresh =
      cached && Date.now() - Date.parse(cached.fetchedAt) < SCHEDULE_CACHE_MAX_AGE_MS;
    if (cacheFresh && cached) {
      const windows = computeActiveWindows(today, cached.events, briefs);
      const modeFromCache = resolveDetectMode({
        today,
        activeWindows: windows,
        lastDailyAt: meta.lastDailyAt ?? null,
        now,
        dailyIntervalHours: DAILY_INTERVAL_HOURS,
      });
      if (modeFromCache === "idle") {
        console.warn("[detect-new-materials] idle earlyExit", {
          year,
          requestId,
          fetchedExternal: false,
        });
        return {
          ok: true,
          mode: "idle",
          earlyExit: true,
          year,
          enqueued: 0,
          fetchedExternal: false,
          activeWindows: windows.length,
          requestId,
        };
      }
    }
  }

  let { snapshot, fetchedExternal } = await ensureSchedule(db, meta, year, needForceFetch);
  // ensureSchedule 可能写库，重读 meta
  meta = await loadMeta(db);

  const activeWindows = computeActiveWindows(today, snapshot.events, briefs);
  let mode: DetectMode =
    forcedMode ??
    resolveDetectMode({
      today,
      activeWindows,
      lastDailyAt: meta.lastDailyAt ?? null,
      now,
      dailyIntervalHours: DAILY_INTERVAL_HOURS,
    });

  if (mode === "idle") {
    console.warn("[detect-new-materials] idle earlyExit", { year, requestId });
    return {
      ok: true,
      mode: "idle",
      earlyExit: true,
      year,
      enqueued: 0,
      fetchedExternal,
      activeWindows: activeWindows.length,
      requestId,
    };
  }

  // dense/daily/backfill：若刚才只用了缓存，补一次新鲜拉取
  if (!fetchedExternal) {
    ({ snapshot, fetchedExternal } = await ensureSchedule(db, meta, year, true));
    meta = await loadMeta(db);
  }

  const windowsAfterFetch = computeActiveWindows(today, snapshot.events, briefs);
  const naCount = await writeNotApplicableSep(db, snapshot.events);

  const onlyIds = mode === "dense" ? new Set(windowsAfterFetch.map((w) => w.eventId)) : undefined;

  // dense：只扫窗口内事件；daily/backfill：全年已披露/已发布缺口
  const targets = collectEnqueueTargets(snapshot.events, briefs, {
    onlyEventIds: onlyIds,
  });

  // dense 时若 onlyIds 含 pending（无材料），collect 会跳过 pending，正确
  const jobIds = await enqueueJobs(db, targets);

  if (mode === "daily") {
    await saveMeta(db, { lastDailyAt: now });
  }

  let generateInvoked = false;
  if (jobIds.length > 0 && mode !== "backfill") {
    // backfill 由 HTTP 触发，避免同步等 LLM 导致网关超时；交给 generate-brief 队列 Timer
    try {
      await appOf().callFunction({
        name: "generate-brief",
        data: { jobId: jobIds[0] },
      });
      generateInvoked = true;
    } catch (err) {
      console.error(
        "[detect-new-materials] callFunction generate-brief failed",
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.warn("[detect-new-materials] done", {
    mode,
    year,
    enqueued: jobIds.length,
    naCount,
    generateInvoked,
    requestId,
  });

  return {
    ok: true,
    mode,
    earlyExit: false,
    year,
    enqueued: jobIds.length,
    jobIds,
    notApplicableSep: naCount,
    fetchedExternal,
    activeWindows: windowsAfterFetch.length,
    generateInvoked,
    requestId,
  };
}
