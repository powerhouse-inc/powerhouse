import { PGlite } from "@electric-sql/pglite";
import knex, { type Knex } from "knex";
import ClientPgLite from "knex-pglite";

export type Db = Knex;

function isPG(connectionString: string) {
  if (connectionString.startsWith("postgres://")) {
    return true;
  }
  return false;
}

export function getDbClient(
  connectionString: string | undefined = undefined,
): Db {
  const isPg = connectionString && isPG(connectionString);
  const client = isPg ? "pg" : (ClientPgLite as typeof knex.Client);

  return knex({
    client,
    // @ts-expect-error
    connection: { pglite: new PGlite(connectionString) },
  });
}
