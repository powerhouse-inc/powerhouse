import { MemoryFS, PGlite } from "@electric-sql/pglite";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { defineWriteIdentityMigrationCases } from "./migration-cases.js";

defineWriteIdentityMigrationCases("PGlite", () => {
  const base = new Kysely<any>({
    dialect: new PGliteDialect(new PGlite({ fs: new MemoryFS() })),
  });
  return Promise.resolve({ base, destroy: () => base.destroy() });
});
