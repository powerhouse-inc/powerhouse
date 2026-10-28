import { checkHost, exportHost } from "@powerhousedao/host-core";
import { parentPort, workerData } from "node:worker_threads";
import type { CheckReply, WorkerInput } from "./controller.ts";

const input = workerData as WorkerInput;
let reply: CheckReply;
try {
  if (input.op === "export") {
    reply = {
      ok: true,
      export: await exportHost(input.projectRoot, input.host),
    };
  } else {
    const { issues } = await checkHost(input.host, {
      projectRoot: input.projectRoot,
      env: input.env,
    });
    reply = { ok: true, issues };
  }
} catch (error) {
  reply = {
    ok: false,
    message: error instanceof Error ? error.message : String(error),
  };
}
parentPort?.postMessage(reply);
