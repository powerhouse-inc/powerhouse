import { PGlite } from "@electric-sql/pglite";
import knex, { type Knex } from "knex";
import ClientPgLite from "knex-pglite";

export type Db = Knex;

export function isPG(connectionString: string) {
  if (connectionString.startsWith("postgresql://")) {
    return true;
  }
  return false;
}

export function getDbClient(
  connectionString: string | undefined = undefined,
): Db {
  const isPg = connectionString && isPG(connectionString);
  const client = isPg ? "pg" : (ClientPgLite as typeof knex.Client);
  const connection = isPg
    ? { connectionString }
    : { pglite: new PGlite(connectionString) };
  return knex({
    client,
    connection,
  });
}
