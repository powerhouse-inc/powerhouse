import { live } from "@electric-sql/pglite/live";
import { PGliteWorker } from "@electric-sql/pglite/worker";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { createRelationalDb } from "shared/processors";

export async function getDb() {
  const worker = new Worker(new URL("./pglite.worker.ts", import.meta.url), {
    type: "module",
  });

  const pglite = await PGliteWorker.create(worker, {
    extensions: { live },
  });

  const kysely = new Kysely({
    dialect: new PGliteDialect(pglite),
  });

  const relationalDb = createRelationalDb(kysely);

  return relationalDb;
}
