// Runs the PGlite worker loop from its TypeScript source via tsx, so tests
// exercise a real worker thread without a dist build.
import { register } from "tsx/esm/api";
import { isMainThread, parentPort } from "node:worker_threads";

register();

if (isMainThread || parentPort === null) {
  throw new Error("pglite-worker-bootstrap.mjs must be run as a worker thread");
}

const { runPGliteWorker } =
  await import("../../../src/pglite/worker/run-worker.ts");

runPGliteWorker(parentPort);
