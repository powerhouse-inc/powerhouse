// Runs the real executor worker loop from its TypeScript entry via tsx, with
// no overrides: a real pg.Pool against the Postgres the host points it at.
import { register } from "tsx/esm/api";
import { isMainThread, parentPort } from "node:worker_threads";

register();

if (isMainThread || parentPort === null) {
  throw new Error(
    "executor-worker-postgres-bootstrap.mjs must be run as a worker thread",
  );
}

const { runWorker } = await import("../../src/executor/worker/run-worker.ts");

runWorker(parentPort);
