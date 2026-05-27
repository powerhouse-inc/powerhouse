import { isMainThread, parentPort } from "node:worker_threads";
import { runProjectionWorker } from "./run-projection-worker.js";

if (isMainThread || parentPort === null) {
  throw new Error("projection-worker entry.ts must be run as a worker thread");
}

runProjectionWorker(parentPort);
