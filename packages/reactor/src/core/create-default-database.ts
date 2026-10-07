import type { Kysely } from "kysely";
import { HardenedPGliteDialect } from "../storage/kysely/pglite-dialect.js";
import type { Database } from "./types.js";

export async function createDefaultDatabase(): Promise<Kysely<Database>> {
  const { Kysely } = await import("kysely");
  const { PGlite } = await import("@electric-sql/pglite");
  return new Kysely<Database>({
    dialect: new HardenedPGliteDialect(new PGlite()),
  });
}
