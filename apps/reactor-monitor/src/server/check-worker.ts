import { checkHost } from "@powerhousedao/host-core";
import { parentPort, workerData } from "node:worker_threads";
import type { CheckInput, CheckReply } from "./controller.ts";

const input = workerData as CheckInput;
let reply: CheckReply;
try {
  const { issues } = await checkHost(input.host, {
    projectRoot: input.projectRoot,
    env: input.env,
  });
  reply = { ok: true, issues };
} catch (error) {
  reply = {
    ok: false,
    message: error instanceof Error ? error.message : String(error),
  };
}
parentPort?.postMessage(reply);
