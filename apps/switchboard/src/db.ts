import { drizzle as drizzleNode } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePg } from "drizzle-orm/pglite";
import { PgDatabase } from "drizzle-orm/pg-core";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";

let db: PgDatabase<any>;

export async function initDb() {
  if (!process.env.DATABASE_URL) {
    const client = new PGlite();
    db = await drizzlePg(client);
  } else {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    await pool.connect();
    db = await drizzleNode(pool);
  }
}

export async function getDb() {
  if (!db) {
    await initDb();
  }
  return db;
}
