import type { PGlite } from "@electric-sql/pglite";
import type { Driver } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";

// kysely-pglite-dialect's driver.destroy() only nulls its reference to the
// PGlite client — it never calls pglite.close(). Without close(), WAL is not
// flushed and the data dir is left in a state that aborts the wasm on the
// next open. This wrapper closes the dialect's PGlite as part of the
// reactor's database.destroy() chain.
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
      if (!pglite.closed) {
        await pglite.close();
      }
    };
    return driver;
  }
}
