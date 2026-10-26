import { isMainThread, parentPort } from "node:worker_threads";
import { runPGliteWorker } from "./run-worker.js";

if (isMainThread || parentPort === null) {
  throw new Error("pglite worker entry must be run as a worker thread");
}

runPGliteWorker(parentPort);
