import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { afterEach, describe, expect, it } from "vitest";
import type {
  InitMessage,
  LogMessage,
  ReadyMessage,
  ResultMessage,
  WorkerMessage,
} from "../../../../src/executor/worker/protocol.js";

// worker-bootstrap.mjs registers the tsx ESM hook so TypeScript files resolve
// from their .js import extensions, then imports entry.ts.
const BOOTSTRAP_PATH = fileURLToPath(
  new URL("./worker-bootstrap.mjs", import.meta.url),
);

function spawnWorker(): Worker {
  return new Worker(BOOTSTRAP_PATH);
}

function makeInitMessage(): InitMessage {
  return {
    type: "init",
    correlationId: "corr-init-1",
    workerId: "worker-test-1",
    poolConfig: {
      enabled: true,
      numWorkers: 1,
      workerType: "thread",
    },
    db: {
      host: "localhost",
      port: 5432,
      database: "test",
      user: "test",
      password: "test",
    },
    signatureVerifier: {
      module: { packageName: "test-verifier", exportName: "factory" },
    },
    models: [],
  };
}

function waitForMessage<T extends WorkerMessage>(
  worker: Worker,
  predicate: (msg: WorkerMessage) => msg is T,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.off("message", handler);
      reject(new Error(`Timed out waiting for message after ${timeoutMs}ms`));
    }, timeoutMs);

    function handler(msg: WorkerMessage): void {
      if (predicate(msg)) {
        clearTimeout(timer);
        worker.off("message", handler);
        resolve(msg);
      }
    }
    worker.on("message", handler);
  });
}

function waitForExit(worker: Worker, timeoutMs = 5000): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Worker did not exit within ${timeoutMs}ms`));
    }, timeoutMs);
    worker.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code ?? -1);
    });
  });
}

const workers: Worker[] = [];
afterEach(async () => {
  for (const w of workers) {
    try {
      await w.terminate();
    } catch {
      // already exited
    }
  }
  workers.length = 0;
});

describe("entry worker integration", () => {
  it("(1) init round-trip: worker posts ready after init", async () => {
    const worker = spawnWorker();
    workers.push(worker);

    const init = makeInitMessage();

    const readyPromise = waitForMessage(
      worker,
      (m): m is ReadyMessage => m.type === "ready",
    );

    worker.postMessage(init);

    const ready = await readyPromise;
    expect(ready.type).toBe("ready");
    expect(ready.correlationId).toBe(init.correlationId);
    expect(ready.workerId).toBe(init.workerId);
  });

  it("(2) execute echo: round-trips execute -> result with same correlationId", async () => {
    const worker = spawnWorker();
    workers.push(worker);

    worker.postMessage(makeInitMessage());
    await waitForMessage(worker, (m): m is ReadyMessage => m.type === "ready");

    const resultPromise = waitForMessage(
      worker,
      (m): m is ResultMessage => m.type === "result",
    );

    worker.postMessage({
      type: "execute",
      correlationId: "corr-exec-1",
      job: {
        id: "job-1",
        kind: "mutation",
        documentId: "doc-1",
        scope: "global",
        branch: "main",
        actions: [],
        operations: [],
        createdAt: new Date().toISOString(),
        queueHint: [],
        retryCount: 0,
        maxRetries: 3,
        errorHistory: [],
        meta: { batchId: "batch-1", batchJobIds: ["job-1"] },
      },
    });

    const result = await resultPromise;
    expect(result.correlationId).toBe("corr-exec-1");
    expect(result.result.success).toBe(true);
    expect(result.result.job.id).toBe("job-1");
  });

  it("(3) uncaughtException: error-level log before worker exits", async () => {
    const worker = spawnWorker();
    workers.push(worker);

    // Attach error listener to prevent the crash from propagating to
    // Vitest as an unhandled error. The crash is intentional in this test.
    worker.on("error", () => {});

    worker.postMessage(makeInitMessage());
    await waitForMessage(worker, (m): m is ReadyMessage => m.type === "ready");

    const logPromise = waitForMessage(
      worker,
      (m): m is LogMessage => m.type === "log" && m.level === "error",
    );
    const exitPromise = waitForExit(worker);

    worker.postMessage({
      type: "__test_throw",
      reason: "synthetic test error",
    });

    const [log, exitCode] = await Promise.all([logPromise, exitPromise]);
    expect(log.level).toBe("error");
    expect(log.message).toBe("worker uncaughtException");
    expect(exitCode).not.toBe(0);
  });

  it("(4) shutdown: worker exits with code 0", async () => {
    const worker = spawnWorker();
    workers.push(worker);

    worker.postMessage(makeInitMessage());
    await waitForMessage(worker, (m): m is ReadyMessage => m.type === "ready");

    const exitPromise = waitForExit(worker);

    worker.postMessage({ type: "shutdown", correlationId: "corr-shutdown-1" });

    const exitCode = await exitPromise;
    expect(exitCode).toBe(0);
  });
});
