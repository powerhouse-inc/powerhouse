// The in-process database the suites here run against, built as Switchboard
// builds its own: PGlite behind knex, read through kysely-knex.
import { PGlite } from "@electric-sql/pglite";
import {
  createRelationalDb,
  type IRelationalDb,
} from "@powerhousedao/shared/processors";
import knex from "knex";
import ClientPgLite from "knex-pglite";
import { Kysely } from "kysely";
import { KyselyKnexDialect, PGColdDialect } from "kysely-knex";

// 1114 = timestamp without time zone. Columns hold UTC; PGlite would otherwise
// read them as local time.
const UTC_PARSERS = {
  1114: (value: string) => new Date(`${value.replace(" ", "T")}Z`),
} as const;

let shared: IRelationalDb | undefined;

// A database of its own, for a suite that needs one nobody else has touched.
export function createFreshRelationalDb(): IRelationalDb {
  const client = knex({
    client: ClientPgLite as typeof knex.Client,
    connection: { pglite: new PGlite({ parsers: UTC_PARSERS }) } as never,
  });
  const kysely = new Kysely<unknown>({
    dialect: new KyselyKnexDialect({
      knex: client,
      kyselySubDialect: new PGColdDialect(),
    }),
  });
  return createRelationalDb(kysely);
}

// One per module graph, so a second caller finds the tables the first migrated.
export function createTestRelationalDb(): IRelationalDb {
  return (shared ??= createFreshRelationalDb());
}
