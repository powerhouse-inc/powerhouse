// Bootstrap for the hybrid projection worker integration test. Registers
// the tsx ESM hook so the TypeScript worker entry resolves from its .js
// import extensions, then runs the real projection worker loop with no
// overrides: a real pg.Pool against the Postgres the host points it at.
import { register } from "tsx/esm/api";
import { isMainThread, parentPort } from "node:worker_threads";

register();

if (isMainThread || parentPort === null) {
  throw new Error(
    "projection-worker-bootstrap.mjs must be run as a worker thread",
  );
}

const { runProjectionWorker } =
  await import("../../src/projection/projection-worker/run-projection-worker.ts");

runProjectionWorker(parentPort);
