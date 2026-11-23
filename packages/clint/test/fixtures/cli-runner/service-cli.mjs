import { defineCli, defineService, defineTrigger } from "@powerhousedao/clint";
import { commands } from "./commands.mjs";

// A Cli that keeps running (its routine has a trigger) and has a service: a
// process that prints its pid and its address, then stays.
const idle = defineTrigger({
  id: "idle",
  type: "poll",
  poll: () => Promise.resolve(null),
});

export const cli = defineCli({
  name: "fixture-services",
  version: "0.0.1",
  description: "A serving Cli with a service",
  commands,
  triggers: [idle],
  routine: { tickInterval: 200 },
  services: [
    defineService({
      id: "worker",
      name: "Worker",
      command: `node ${process.env.FIXTURE_TEST_SERVICE}`,
      env: () => ({
        TEST_SERVICE_MODE: "ready",
        TEST_SERVICE_PORT: "4592",
        TEST_SERVICE_REPORT_PID: "1",
      }),
      readiness: {
        pattern: /Server listening on http:\/\/localhost:(\d+)/,
        timeout: 20_000,
        captures: { port: 1 },
      },
      shutdown: { signal: "SIGTERM", timeout: 3000 },
    }),
  ],
});
