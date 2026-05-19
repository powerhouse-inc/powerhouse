import { isMainThread, parentPort } from "node:worker_threads";
import { runWorker } from "./run-worker.js";

if (isMainThread || parentPort === null) {
  throw new Error("entry.ts must be run as a worker thread");
}

runWorker(parentPort);
