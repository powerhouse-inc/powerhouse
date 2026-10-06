import type { PGlite } from "@electric-sql/pglite";
import {
  HardenedPGliteDialect,
  type PGliteSession,
} from "@powerhousedao/reactor";
import type { Dialect } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";

/** A query-only proxy (Connect's worker RPC) has no session here to harden; its worker does that. */
export function relationalDialect(instance: unknown): Dialect {
  const session = instance as Partial<PGliteSession>;
  if (
    typeof session.exec === "function" &&
    typeof session.isInTransaction === "function"
  ) {
    return new HardenedPGliteDialect(session as PGliteSession);
  }
  return new PGliteDialect(instance as PGlite);
}
