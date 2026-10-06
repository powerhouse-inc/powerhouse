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

type IntrospectedDatabase = Parameters<Dialect["createIntrospector"]>[0];

// kysely-pglite-dialect's driver.destroy() only nulls its reference to the
// PGlite client — it never calls pglite.close(). Without close(), the store
// misses its shutdown checkpoint and the next open runs WAL recovery. This
// wrapper closes the dialect's PGlite as part of the reactor's
// database.destroy() chain, around the reactor's hardened dialect.
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
