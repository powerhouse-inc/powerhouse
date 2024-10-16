import { drizzle } from "drizzle-orm/pglite";
import { PgDatabase } from "drizzle-orm/pg-core";

let db: PgDatabase<any>;

export async function getDb() {
  if (!db) {
    db = await drizzle("pglite");
  }
  return db;
}
