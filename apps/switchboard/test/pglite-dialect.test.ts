import { PGlite } from "@electric-sql/pglite";
import { Kysely, sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import { ClosablePGliteDialect } from "../src/pglite-dialect.js";

describe("ClosablePGliteDialect", () => {
  const created: PGlite[] = [];

  afterEach(async () => {
    for (const p of created.splice(0)) {
      if (!p.closed) await p.close();
    }
  });

  it("closes the underlying PGlite when the Kysely instance is destroyed", async () => {
    const pglite = new PGlite();
    created.push(pglite);
    const db = new Kysely({ dialect: new ClosablePGliteDialect(pglite) });

    // Kysely lazy-inits the driver on first query; no query means destroy
    // skips the driver, which would defeat the purpose of this test.
    await sql`select 1`.execute(db);
    expect(pglite.closed).toBe(false);

    await db.destroy();
    expect(pglite.closed).toBe(true);
  });

  it("tolerates a close that rejects because the runtime aborted", async () => {
    const pglite = new PGlite();
    created.push(pglite);
    const db = new Kysely({ dialect: new ClosablePGliteDialect(pglite) });
    await sql`select 1`.execute(db);
    const realClose = pglite.close.bind(pglite);
    pglite.close = () => {
      pglite.close = realClose;
      return Promise.reject(new Error("PGlite aborted: ENOSPC"));
    };

    await expect(db.destroy()).resolves.toBeUndefined();
  });

  it("rethrows a close that fails for any other reason", async () => {
    const pglite = new PGlite();
    created.push(pglite);
    const db = new Kysely({ dialect: new ClosablePGliteDialect(pglite) });
    await sql`select 1`.execute(db);
    const realClose = pglite.close.bind(pglite);
    pglite.close = () => {
      pglite.close = realClose;
      return Promise.reject(new Error("disk gone"));
    };

    await expect(db.destroy()).rejects.toThrow("disk gone");
  });

  it("is idempotent if the PGlite is already closed", async () => {
    const pglite = new PGlite();
    created.push(pglite);
    const db = new Kysely({ dialect: new ClosablePGliteDialect(pglite) });

    await sql`select 1`.execute(db);
    await pglite.close();
    expect(pglite.closed).toBe(true);

    await expect(db.destroy()).resolves.toBeUndefined();
  });
});
