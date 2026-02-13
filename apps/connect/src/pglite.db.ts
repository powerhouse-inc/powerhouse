import { live } from "@electric-sql/pglite/live";
import { PGliteWorker } from "@electric-sql/pglite/worker";

export async function getDb() {
  if (window.ph?.processorsRelationalDb)
    return window.ph.processorsRelationalDb;

  const w = new Worker(new URL("./pglite.worker.ts", import.meta.url), {
    type: "module",
  });

  const db = await PGliteWorker.create(w, {
    extensions: { live },
  });

  return db;
}
