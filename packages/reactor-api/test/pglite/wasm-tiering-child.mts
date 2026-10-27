import { Worker } from "node:worker_threads";
import { disableWasmWrapperTiering } from "../../src/pglite/wasm-wrapper-tiering.js";
import { nsPerCall } from "./wasm-tiering-probe.mjs";

const apply = process.argv[2] === "apply";
const applied = apply ? disableWasmWrapperTiering() : false;
const again = apply ? disableWasmWrapperTiering() : false;
const main = nsPerCall();
const worker = await new Promise<number>((resolve, reject) => {
  const w = new Worker(new URL("./wasm-tiering-probe.mts", import.meta.url));
  w.once("message", (value: number) => {
    void w.terminate();
    resolve(value);
  });
  w.once("error", reject);
});
process.stdout.write(`${JSON.stringify({ applied, again, main, worker })}\n`);
