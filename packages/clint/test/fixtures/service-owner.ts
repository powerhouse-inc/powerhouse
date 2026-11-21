/**
 * A process that owns one service (test-service.js in "ready" mode) and ends
 * WITHOUT stopping it, as a CLI does when its teardown never runs:
 *
 *   node --import tsx/esm service-owner.ts <servicesDir> <ending>
 *
 * <ending>: "return" (the event loop drains), "exit" (process.exit), "throw"
 * (an uncaught error) or "wait" (stays up until a signal ends it).
 * Prints "pids <shellPid> <servicePid>" once the service is ready.
 */
import path from "node:path";
import { createServiceManager } from "../../src/core/services.js";

const [servicesDir, ending] = process.argv.slice(2);
const testService = path.join(import.meta.dirname, "test-service.js");

const services = createServiceManager(
  [
    {
      id: "owned",
      command: `node ${testService}`,
      env: () => ({
        TEST_SERVICE_MODE: "ready",
        TEST_SERVICE_REPORT_PID: "1",
      }),
      readiness: {
        patterns: [
          {
            name: "pid",
            pattern: /test-service pid (\d+)/,
            captures: { servicePid: 1 },
          },
          { name: "listening", pattern: /Server listening/ },
        ],
        timeout: 10_000,
      },
    },
  ],
  { config: {}, servicesDir: servicesDir! },
);

await services.start("owned");
const [status] = services.list("owned");
console.log(`pids ${status?.pid} ${status?.endpoints?.servicePid}`);

if (ending === "exit") {
  process.exit(0);
} else if (ending === "throw") {
  setTimeout(() => {
    throw new Error("owner crashed");
  }, 0);
} else if (ending === "wait") {
  setInterval(() => {}, 60_000);
}
// "return": nothing keeps the process alive
