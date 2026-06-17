// Bootstrap for the entry integration test. Registers the tsx ESM hook
// so TypeScript files can be imported with .js extensions, then drives
// the worker message loop using runWorker() with PGlite and stub-factory
// overrides so the test doesn't need a real Postgres or model packages.
import { register } from "tsx/esm/api";
import { isMainThread, parentPort } from "node:worker_threads";

register();

if (isMainThread || parentPort === null) {
  throw new Error("worker-bootstrap.mjs must be run as a worker thread");
}

const { runWorker } =
  await import("../../../../src/executor/worker/run-worker.ts");
const { Kysely } = await import("kysely");
const { PGlite } = await import("@electric-sql/pglite");
const { PGliteDialect } = await import("kysely-pglite-dialect");
const { REACTOR_SCHEMA, runMigrations } =
  await import("../../../../src/storage/migrations/migrator.ts");

async function createPgliteDatabase() {
  const pglite = new PGlite();
  const kysely = new Kysely({
    dialect: new PGliteDialect(pglite),
  });
  return {
    kysely,
    async shutdown() {
      try {
        await kysely.destroy();
      } catch {
        // best-effort
      }
      try {
        await pglite.close();
      } catch {
        // best-effort
      }
    },
  };
}

runWorker(parentPort, {
  async createDatabase() {
    return createPgliteDatabase();
  },
  async beforeBuildExecutor(db) {
    await runMigrations(db, REACTOR_SCHEMA);
  },
  async loadFactory(spec) {
    // Stub factory: returns a no-op verifier or a noop module so init
    // doesn't try to dynamically import anything from the filesystem.
    return {
      verify: async () => true,
    };
  },
});
