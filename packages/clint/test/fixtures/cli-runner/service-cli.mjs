import {
  defineCli,
  defineCommand,
  defineService,
  defineTrigger,
} from "@powerhousedao/clint";
import { callControl } from "@powerhousedao/host-core/control-channel";
import { z } from "zod";
import { commands } from "./commands.mjs";

// Says which process a command runs beside, asked over that process's channel.
const serving = defineCommand({
  id: "serving",
  description: "Name the running Cli this command runs beside",
  inputSchema: z.object({}),
  execute: async (_, ctx) => {
    if (!ctx.serving) return "alone";
    const hello = await callControl(ctx.serving, "hello");
    return `beside ${hello.cli} pid ${hello.pid}`;
  },
});

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
  commands: [...commands, serving],
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
