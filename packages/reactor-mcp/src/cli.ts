import { logger } from "./logger.js";
import { initStdioMcpServer } from "./stdio/index.js";

initStdioMcpServer({
  remoteDrive: process.argv.at(2),
  root: process.cwd(),
}).catch((error: unknown) => {
  logger.error(error);
  process.exit(1);
});
