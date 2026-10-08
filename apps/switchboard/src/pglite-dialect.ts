import type { PGlite } from "@electric-sql/pglite";
import type { Driver } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";

// kysely-pglite-dialect's driver.destroy() only nulls its reference to the
// PGlite client — it never calls pglite.close(). Without close(), the store
// misses its shutdown checkpoint and the next open runs WAL recovery. This
// wrapper closes the dialect's PGlite as part of the reactor's
// database.destroy() chain.
export class ClosablePGliteDialect extends PGliteDialect {
  readonly #pglite: PGlite;

  constructor(pglite: PGlite) {
    super(pglite);
    this.#pglite = pglite;
  }

  createDriver(): Driver {
    const driver = super.createDriver();
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
}
