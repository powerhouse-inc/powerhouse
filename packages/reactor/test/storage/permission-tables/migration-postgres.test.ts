import { PgDatabase } from "../../purge/e2e/harness.js";
import { definePermissionTablesMigrationCases } from "./migration-cases.js";

definePermissionTablesMigrationCases("Postgres", async () => {
  const pg = await PgDatabase.create("reactor_permission_tables_migration");
  return { base: pg.base, destroy: () => pg.destroy() };
});
