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

/** Kysely's own parameter type for `createIntrospector`, which is untyped. */
type IntrospectedDatabase = Parameters<Dialect["createIntrospector"]>[0];

/**
 * The reactor's hardened PGlite dialect, plus close-on-destroy.
 *
 * Two problems, one wrapper, because switchboard's PGlite deployments need
 * both:
 *
 *  - kysely-pglite-dialect's `driver.destroy()` only nulls its reference to the
 *    PGlite client; it never calls `pglite.close()`. Without close(), WAL is
 *    not flushed and the data dir is left in a state that aborts the wasm on
 *    the next open. This closes the dialect's PGlite as part of the reactor's
 *    `database.destroy()` chain.
 *  - A COMMIT on an aborted transaction is answered with a ROLLBACK command tag
 *    and no error, and Kysely never inspects the tag - so `transaction()
 *    .execute()` resolves while nothing was written, the job is reported
 *    COMPLETED and the sync cursor advances past data that does not exist.
 *    {@link HardenedPGliteDialect} forestalls that (and three more faults of a
 *    single shared session: a rollback that swallows the real error, a poisoned
 *    session handed to the next caller, an unbounded `acquireConnection`).
 *    Switchboard was the last deployment still on the raw dialect.
 *
 * Composition, not inheritance: the hardened dialect wraps upstream's rather
 * than replacing it, so kysely-pglite-dialect stays unforked.
 */
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
      if (!pglite.closed) {
        await pglite.close();
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
