import { live } from "@electric-sql/pglite/live";
import { PGliteWorker } from "@electric-sql/pglite/worker";
import { createRelationalDb } from "@powerhousedao/shared/processors";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";

export async function getDb() {
  const worker = new Worker(new URL("./pglite.worker.js", import.meta.url), {
    type: "module",
  });

  const pgLite = await PGliteWorker.create(worker, {
    extensions: { live },
  });

  const kysely = new Kysely({
    dialect: new PGliteDialect(pgLite),
  });

  const relationalDb = createRelationalDb(kysely);

  return { pgLite, relationalDb };
}
