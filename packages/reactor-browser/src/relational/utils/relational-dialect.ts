import type { PGlite } from "@electric-sql/pglite";
import {
  HardenedPGliteDialect,
  type HardenedPGliteDialectOptions,
  type PGliteSession,
} from "@powerhousedao/reactor";
import { Kysely, type Dialect } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";

/** A query-only proxy (Connect's worker RPC) has no session here to harden; its worker does that. */
export function relationalDialect(
  instance: unknown,
  options: Partial<HardenedPGliteDialectOptions> = {},
): Dialect {
  const session = instance as Partial<PGliteSession>;
  if (
    typeof session.exec === "function" &&
    typeof session.isInTransaction === "function"
  ) {
    return new HardenedPGliteDialect(session as PGliteSession, options);
  }
  return new PGliteDialect(instance as PGlite);
}

const kyselyByInstance = new WeakMap<object, Kysely<unknown>>();

/** One Kysely, so one queue, per PGlite; `options` apply from the first caller, which creates it. */
export function relationalKysely<Schema>(
  instance: object,
  options: Partial<HardenedPGliteDialectOptions> = {},
): Kysely<Schema> {
  let kysely = kyselyByInstance.get(instance);
  if (kysely === undefined) {
    kysely = new Kysely<unknown>({
      dialect: relationalDialect(instance, options),
    });
    kyselyByInstance.set(instance, kysely);
  }
  return kysely as Kysely<Schema>;
}
