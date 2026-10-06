import type { PGlite } from "@electric-sql/pglite";
import {
  HardenedPGliteDialect,
  type HardenedPGliteDialectOptions,
} from "@powerhousedao/reactor";
import type {
  DatabaseIntrospector,
  Dialect,
  DialectAdapter,
  Driver,
  QueryCompiler,
} from "kysely";
import type { ILogger } from "document-model";
import { triggerFatalShutdown } from "./fatal-shutdown.mjs";

type FatalProcess = Parameters<typeof triggerFatalShutdown>[2];

/** A poisoned store cannot recover in process, so it takes the fatal shutdown and a supervisor restart. */
export function reactorPgliteDialectOptions(
  logger: ILogger,
  proc?: FatalProcess,
): Partial<HardenedPGliteDialectOptions> {
  return {
    onDiagnostic: (message, error) =>
      logger.error(`[pglite-dialect] ${message}: @error`, error),
    onPoisoned: (cause) => {
      if (!triggerFatalShutdown("PGlite session poisoned", cause, proc)) {
        logger.error("PGlite session poisoned: @error", cause);
      }
    },
  };
}

type IntrospectedDatabase = Parameters<Dialect["createIntrospector"]>[0];

// kysely-pglite-dialect's driver.destroy() only nulls its reference to the
// PGlite client — it never calls pglite.close(). Without close(), the store
// misses its shutdown checkpoint and the next open runs WAL recovery. This
// wrapper closes the dialect's PGlite as part of the reactor's
// database.destroy() chain.
export class ClosablePGliteDialect implements Dialect {
  readonly #inner: HardenedPGliteDialect;
  readonly #pglite: PGlite;

  constructor(
    pglite: PGlite,
    options: Partial<HardenedPGliteDialectOptions> = {},
  ) {
    this.#pglite = pglite;
    this.#inner = new HardenedPGliteDialect(pglite, options);
  }

  createAdapter(): DialectAdapter {
    return this.#inner.createAdapter();
  }

  createDriver(): Driver {
    const driver = this.#inner.createDriver();
    const pglite = this.#pglite;
    const innerDestroy = driver.destroy.bind(driver);
    driver.destroy = async () => {
      await innerDestroy();
      if (pglite.closed) return;
      try {
        await pglite.close();
      } catch (err) {
        // An aborted runtime (Postgres PANIC) has nothing left to flush.
        if (!/PGlite aborted/.test(String(err))) throw err;
      }
    };
    return driver;
  }

  createQueryCompiler(): QueryCompiler {
    return this.#inner.createQueryCompiler();
  }

  createIntrospector(db: IntrospectedDatabase): DatabaseIntrospector {
    return this.#inner.createIntrospector(db);
  }
}
