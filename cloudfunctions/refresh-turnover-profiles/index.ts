/**
 * Event Function：收盘后维护每日 `turnover_profile`（量能洞察的长期基线样本）。
 *
 * 部署人工步骤（部署脚本不会自动创建）：
 * 1. CloudBase 控制台为本函数配置定时触发器：工作日 15:10 Asia/Shanghai（cron `0 10 15 * * MON-FRI`）。
 * 2. `pipeline_meta` 集合需建 `docType` + `tradeDate` 复合索引，否则 `listTurnoverProfiles` 运行时报错。
 *
 * 只由定时触发或手工 `{ mode: "seed" }` 调用；HTTP 轮询路径不得调用本函数。
 */
import cloudbase from "@cloudbase/node-sdk";

import { fetchDailyKlines, fetchTrends2 } from "../get-market-turnover/eastmoney";
import { fetchTencentDayMinuteSeries } from "../get-market-turnover/infrastructure/providers/tencent";
import {
  createTurnoverRepository,
  type TurnoverDatabase,
} from "../get-market-turnover/infrastructure/repository";
import { maintainTurnoverProfiles, type MaintainMode } from "./maintain";

const ENV_ID = process.env.TCB_ENV || process.env.SCF_NAMESPACE || "trader-d4gl4d7a1cb6baebb";

type RefreshEvent = {
  mode?: MaintainMode;
};

type RefreshContext = {
  request_id?: string;
  requestId?: string;
};

function dbOf(): TurnoverDatabase {
  return cloudbase.init({ env: ENV_ID }).database() as unknown as TurnoverDatabase;
}

export async function main(event: RefreshEvent = {}, context: RefreshContext = {}) {
  const requestId = context.request_id ?? context.requestId ?? `local-${Date.now()}`;

  const result = await maintainTurnoverProfiles({
    provider: { fetchTrends2, fetchDailyKlines, fetchTencentDayMinuteSeries },
    repository: createTurnoverRepository(dbOf()),
    mode: event.mode ?? "daily",
    now: new Date(),
    onError: (scope, message) => {
      console.error(`[refresh-turnover-profiles] ${scope}: ${message}`);
    },
  });

  console.warn("[refresh-turnover-profiles] done", {
    mode: result.mode,
    saved: result.savedDates,
    skipped: result.skipped.length,
    pruned: result.pruned,
    errors: result.errors.length,
    requestId,
  });

  return { ...result, requestId };
}
