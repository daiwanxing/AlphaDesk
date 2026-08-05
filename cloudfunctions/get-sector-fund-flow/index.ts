import { createSectorFundFlowApplication } from "./application/service";
import { createSectorFundFlowServer } from "./http";

const application = createSectorFundFlowApplication({
  onError: (scope, message) => {
    process.stderr.write(`[get-sector-fund-flow] ${scope}: ${message}\n`);
  },
});

const server = createSectorFundFlowServer(application.buildResponse);
server.listen(9000);
