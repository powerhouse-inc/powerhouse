import { MemoryFS, PGlite } from "@electric-sql/pglite";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { definePermissionTablesMigrationCases } from "./migration-cases.js";

definePermissionTablesMigrationCases("PGlite", () => {
  const base = new Kysely<any>({
    dialect: new PGliteDialect(new PGlite({ fs: new MemoryFS() })),
  });
  return Promise.resolve({ base, destroy: () => base.destroy() });
});
