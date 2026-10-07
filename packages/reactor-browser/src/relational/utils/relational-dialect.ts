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

type PoisonListener = (cause: Error) => void;

type SharedRelationalDb = {
  kysely: Kysely<unknown>;
  listeners: Set<PoisonListener>;
  poisoned?: Error;
};

const sharedByInstance = new WeakMap<object, SharedRelationalDb>();

function sharedFor(
  instance: object,
  options: Partial<Omit<HardenedPGliteDialectOptions, "onPoisoned">> = {},
): SharedRelationalDb {
  let shared = sharedByInstance.get(instance);
  if (shared === undefined) {
    const listeners = new Set<PoisonListener>();
    const created: SharedRelationalDb = {
      listeners,
      kysely: new Kysely<unknown>({
        dialect: relationalDialect(instance, {
          ...options,
          onPoisoned: (cause) => {
            created.poisoned = cause;
            for (const listener of [...listeners]) {
              try {
                listener(cause);
              } catch (error) {
                console.error("relational onPoisoned listener threw", error);
              }
            }
          },
        }),
      }),
    };
    shared = created;
    sharedByInstance.set(instance, shared);
  }
  return shared;
}

/** One Kysely, so one queue, per PGlite; `options` apply from the first caller, which creates it. */
export function relationalKysely<Schema>(
  instance: object,
  options: Partial<Omit<HardenedPGliteDialectOptions, "onPoisoned">> = {},
): Kysely<Schema> {
  return sharedFor(instance, options).kysely as Kysely<Schema>;
}

/**
 * Tells `listener` once the shared session of `instance` is poisoned, however
 * many consumers share it and whichever opened it first; a late subscriber is
 * told at once. Returns the unsubscribe.
 */
export function subscribeRelationalPoisoned(
  instance: object,
  listener: PoisonListener,
): () => void {
  const shared = sharedFor(instance);
  if (shared.poisoned !== undefined) {
    listener(shared.poisoned);
    return () => undefined;
  }
  shared.listeners.add(listener);
  return () => {
    shared.listeners.delete(listener);
  };
}
