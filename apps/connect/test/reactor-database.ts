import { PGlite } from "@electric-sql/pglite";
import {
  type Database,
  REACTOR_SCHEMA,
  runMigrations,
} from "@powerhousedao/reactor";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeAll } from "vitest";

// Covers the first wasm compile and initdb on a contended CI runner.
const TEMPLATE_TIMEOUT_MS = 30_000;

/** Copies of one migrated template boot without initdb or migrations. */
export function useReactorDatabases() {
  let dump: Blob | undefined;
  const open: PGlite[] = [];

  beforeAll(async () => {
    const template = new PGlite();
    try {
      const result = await runMigrations(
        new Kysely<Database>({ dialect: new PGliteDialect(template) }),
        REACTOR_SCHEMA,
      );
      if (!result.success) {
        throw result.error ?? new Error("reactor migrations failed");
      }
      dump = await template.dumpDataDir("none");
    } finally {
      await template.close();
    }
  }, TEMPLATE_TIMEOUT_MS);

  // Kysely's destroy leaves the PGlite open.
  afterEach(async () => {
    for (const pg of open.splice(0)) {
      if (!pg.closed) await pg.close();
    }
  });

  const pglite = (): PGlite => {
    if (!dump) throw new Error("the reactor database template is not ready");
    const pg = new PGlite({ loadDataDir: dump });
    open.push(pg);
    return pg;
  };

  return {
    pglite,
    kysely: (pg: PGlite = pglite()) =>
      new Kysely<Database>({ dialect: new PGliteDialect(pg) }),
  };
}
