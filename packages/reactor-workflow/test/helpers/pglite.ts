// The in-process database the suites here run against. One per module graph,
// so a second caller finds the tables the first one migrated.
import { PGlite } from "@electric-sql/pglite";
import {
  createRelationalDb,
  type IRelationalDb,
} from "@powerhousedao/shared/processors";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";

// 1114 = timestamp without time zone. Columns hold UTC; PGlite would otherwise
// read them as local time.
const UTC_PARSERS = {
  1114: (value: string) => new Date(`${value.replace(" ", "T")}Z`),
} as const;

let shared: IRelationalDb | undefined;

export function createTestRelationalDb(): IRelationalDb {
  if (shared) return shared;
  const kysely = new Kysely<unknown>({
    dialect: new PGliteDialect(new PGlite({ parsers: UTC_PARSERS })),
  });
  shared = createRelationalDb(kysely);
  return shared;
}
