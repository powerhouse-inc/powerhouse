import type { PGlite } from "@electric-sql/pglite";
import {
  HardenedPGliteDialect,
  type PGliteSession,
} from "@powerhousedao/reactor";
import { Kysely, type Dialect } from "kysely";
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

const kyselyByInstance = new WeakMap<object, Kysely<unknown>>();

/** One Kysely, so one queue, per PGlite: two would each hold a lease on the one session. */
export function relationalKysely<Schema>(instance: object): Kysely<Schema> {
  let kysely = kyselyByInstance.get(instance);
  if (kysely === undefined) {
    kysely = new Kysely<unknown>({ dialect: relationalDialect(instance) });
    kyselyByInstance.set(instance, kysely);
  }
  return kysely as Kysely<Schema>;
}
