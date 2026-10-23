// The tsx bootstrap, plus a statement that simulates an Emscripten abort:
// it calls the module's onAbort (the hook DurableNodeFs installs, which
// Emscripten calls on a Postgres PANIC) and throws the runtime's error.
import { register } from "tsx/esm/api";
import { isMainThread, parentPort } from "node:worker_threads";

register();

if (isMainThread || parentPort === null) {
  throw new Error(
    "pglite-worker-abort-bootstrap.mjs must be run as a worker thread",
  );
}

export const SIMULATE_ABORT_SQL = "select 'ph:test-abort'";

const { PGlite } = await import("@electric-sql/pglite");
const originalQuery = PGlite.prototype.query;
PGlite.prototype.query = function query(sql, params, options) {
  if (sql === SIMULATE_ABORT_SQL) {
    this.mod.onAbort("simulated panic");
    return Promise.reject(new Error("Aborted(simulated panic)"));
  }
  return originalQuery.call(this, sql, params, options);
};

const { runPGliteWorker } =
  await import("../../../src/pglite/worker/run-worker.ts");

runPGliteWorker(parentPort);
