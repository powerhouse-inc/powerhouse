import { PGlite } from "@electric-sql/pglite";
import pkg from "knex";
import ClientPgLite from "knex-pglite";
const knex = pkg;

function isPG(connectionString: string) {
  if (connectionString.startsWith("postgres://")) {
    return true;
  }
  return false;
}

export function getKnexClient(
  connectionString: string | undefined = undefined,
) {
  const isPg = connectionString && isPG(connectionString);
  const client = isPg ? "pg" : (ClientPgLite as typeof knex.Client);

  return knex({
    client,
    // @ts-expect-error
    connection: { pglite: new PGlite(connectionString) },
  });
}
