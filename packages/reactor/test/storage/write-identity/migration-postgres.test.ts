import { PgDatabase } from "../../purge/e2e/harness.js";
import { defineWriteIdentityMigrationCases } from "./migration-cases.js";

defineWriteIdentityMigrationCases("Postgres", async () => {
  const pg = await PgDatabase.create("reactor_write_identity_migration");
  return { base: pg.base, destroy: () => pg.destroy() };
});
