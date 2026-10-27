import { isMainThread, parentPort } from "node:worker_threads";

// A wasm loop that calls its JS import `env.f` n times: `run(n)`.
const bytes = Uint8Array.from([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 8, 2, 96, 0, 0, 96, 1, 127, 0, 2, 9, 1, 3,
  101, 110, 118, 1, 102, 0, 0, 3, 2, 1, 1, 7, 7, 1, 3, 114, 117, 110, 0, 1, 10,
  26, 1, 24, 0, 2, 64, 3, 64, 32, 0, 69, 13, 1, 16, 0, 32, 0, 65, 1, 107, 33, 0,
  12, 0, 11, 11, 11,
]);

type Run = (n: number) => void;

export type Comparison = { before: number; after: number };

/** A fresh instance; it keeps the tiering budget in force when it was created. */
export function importCaller(): Run {
  const instance = new WebAssembly.Instance(new WebAssembly.Module(bytes), {
    env: { f: () => {} },
  });
  const run = instance.exports.run as Run;
  run(5000);
  return run;
}

function nsPerCall(run: Run, n: number): number {
  const start = process.hrtime.bigint();
  run(n);
  return Number(process.hrtime.bigint() - start) / n;
}

/** Fastest ns per call of each, over rounds that alternate between the two. */
export function compare(before: Run, after: Run): Comparison {
  let best = { before: Infinity, after: Infinity };
  for (let round = 0; round < 20; round++) {
    best = {
      before: Math.min(best.before, nsPerCall(before, 500_000)),
      after: Math.min(best.after, nsPerCall(after, 500_000)),
    };
  }
  return best;
}

// Worker side: a pre-flag instance, "ready", then a post-flag one on "go".
if (!isMainThread && parentPort) {
  const port = parentPort;
  const before = importCaller();
  port.once("message", () => port.postMessage(compare(before, importCaller())));
  port.postMessage("ready");
}
