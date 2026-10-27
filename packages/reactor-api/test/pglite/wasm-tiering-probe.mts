import { isMainThread, parentPort } from "node:worker_threads";

// A wasm loop that calls its JS import `env.f` n times: `run(n)`.
const bytes = Uint8Array.from([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 8, 2, 96, 0, 0, 96, 1, 127, 0, 2, 9, 1, 3,
  101, 110, 118, 1, 102, 0, 0, 3, 2, 1, 1, 7, 7, 1, 3, 114, 117, 110, 0, 1, 10,
  26, 1, 24, 0, 2, 64, 3, 64, 32, 0, 69, 13, 1, 16, 0, 32, 0, 65, 1, 107, 33, 0,
  12, 0, 11, 11, 11,
]);

/** Best of three: nanoseconds per wasm-to-JS import call. */
export function nsPerCall(): number {
  const instance = new WebAssembly.Instance(new WebAssembly.Module(bytes), {
    env: { f: () => {} },
  });
  const run = instance.exports.run as (n: number) => void;
  run(5000);
  let best = Infinity;
  for (let round = 0; round < 3; round++) {
    const n = 5_000_000;
    const start = process.hrtime.bigint();
    run(n);
    best = Math.min(best, Number(process.hrtime.bigint() - start) / n);
  }
  return best;
}

if (!isMainThread) parentPort?.postMessage(nsPerCall());
