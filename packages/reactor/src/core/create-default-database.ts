import type { Kysely } from "kysely";
import type { Database } from "./types.js";

export async function createDefaultDatabase(): Promise<Kysely<Database>> {
  const { Kysely } = await import("kysely");
  const { PGlite } = await import("@electric-sql/pglite");
  const { HardenedPGliteDialect } =
    await import("../storage/kysely/pglite-dialect.js");
  return new Kysely<Database>({
    dialect: new HardenedPGliteDialect(new PGlite()),
  });
}
