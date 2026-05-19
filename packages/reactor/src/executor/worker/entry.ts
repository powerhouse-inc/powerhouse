import { isMainThread, parentPort } from "node:worker_threads";
import { createForwardingLogger } from "./forwarding-logger.js";
import type { InitMessage, ParentMessage, WorkerMessage } from "./protocol.js";
import { errorToInfo } from "./sanitize.js";

if (isMainThread || parentPort === null) {
  throw new Error("entry.ts must be run as a worker thread");
}

let workerId = "";
let initCompleted = false;
let initConfig: InitMessage | null = null;

function post(msg: WorkerMessage): void {
  (parentPort as NonNullable<typeof parentPort>).postMessage(msg);
}

const logger = createForwardingLogger(post);

process.on("uncaughtException", (err: unknown) => {
  try {
    post({
      type: "log",
      level: "error",
      message: "worker uncaughtException",
      args: [errorToInfo(err)],
      timestamp: Date.now(),
    });
  } catch {
    // nothing left to do
  }
  throw err;
});

process.on("unhandledRejection", (reason: unknown) => {
  try {
    post({
      type: "log",
      level: "error",
      message: "worker unhandledRejection",
      args: [errorToInfo(reason)],
      timestamp: Date.now(),
    });
  } catch {
    // nothing left to do
  }
});

export function handleParentMessage(msg: ParentMessage): void {
  switch (msg.type) {
    case "init": {
      workerId = msg.workerId;
      initConfig = msg;
      initCompleted = true;
      logger.info("worker initialized", msg.workerId);
      post({
        type: "ready",
        correlationId: msg.correlationId,
        workerId: msg.workerId,
      });
      break;
    }

    case "execute": {
      if (!initCompleted) {
        logger.warn("received execute before init");
        break;
      }
      try {
        post({
          type: "result",
          correlationId: msg.correlationId,
          result: {
            job: msg.job,
            success: true,
            completedAt: new Date().toISOString(),
            duration: 0,
          },
        });
      } catch (err: unknown) {
        post({
          type: "result",
          correlationId: msg.correlationId,
          result: {
            job: msg.job,
            success: false,
          },
          error: errorToInfo(err),
        });
      }
      break;
    }

    case "shutdown": {
      logger.info("worker shutting down", workerId);
      post({
        type: "log",
        level: "info",
        message: "worker shutdown",
        args: [],
        timestamp: Date.now(),
      });
      process.exit(0);
      break;
    }

    case "abort": {
      logger.warn("abort received (no-op stub)", msg.correlationId);
      break;
    }

    case "load-model": {
      logger.warn("load-model received (no-op stub)", msg.correlationId);
      break;
    }

    default: {
      // Test-only hook: allows integration tests to trigger uncaughtException.
      // The cast is intentional — this branch is only reached with unknown
      // message types that TypeScript cannot enumerate.
      const raw = msg as Record<string, unknown>;
      if (raw["type"] === "__test_throw") {
        const reason = String(raw["reason"] ?? "synthetic uncaughtException");
        setTimeout(() => {
          throw new Error(reason);
        }, 0);
        return;
      }
      const _exhaustive: never = msg;
      void _exhaustive;
      break;
    }
  }
}

(parentPort as NonNullable<typeof parentPort>).on(
  "message",
  handleParentMessage,
);

export { initConfig, initCompleted, workerId };
