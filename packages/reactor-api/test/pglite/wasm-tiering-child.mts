import { once } from "node:events";
import { Worker } from "node:worker_threads";
import { disableWasmWrapperTiering } from "../../src/pglite/wasm-wrapper-tiering.js";
import {
  compare,
  importCaller,
  type Comparison,
} from "./wasm-tiering-probe.mjs";

// Instances created before the helper runs keep tiering and are the control.
const before = importCaller();
const worker = new Worker(new URL("./wasm-tiering-probe.mts", import.meta.url));
const [ready] = (await once(worker, "message")) as [string];
if (ready !== "ready") throw new Error(`worker said ${ready}`);

const applied = disableWasmWrapperTiering();
const again = disableWasmWrapperTiering();
const main = compare(before, importCaller());
worker.postMessage("go");
const [inWorker] = (await once(worker, "message")) as [Comparison];
await worker.terminate();
process.stdout.write(
  `${JSON.stringify({ applied, again, main, worker: inWorker })}\n`,
);
