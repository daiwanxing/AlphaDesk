import cloudbase from "@cloudbase/node-sdk";

import { createTurnoverApplication } from "./application/service";
import { createTurnoverRepository, type TurnoverDatabase } from "./infrastructure/repository";
import { createTurnoverServer } from "./http";

const ENV_ID = process.env.TCB_ENV || process.env.SCF_NAMESPACE || "trader-d4gl4d7a1cb6baebb";

function dbOf(): TurnoverDatabase {
  return cloudbase.init({ env: ENV_ID }).database() as unknown as TurnoverDatabase;
}

const application = createTurnoverApplication({
  repository: () => createTurnoverRepository(dbOf()),
  onError: (scope, message) => {
    process.stderr.write(`[get-market-turnover] ${scope}: ${message}\n`);
  },
});

const server = createTurnoverServer(application.buildResponse);
server.listen(9000);
