import { PGlite } from "@electric-sql/pglite";
import knex, { type Knex } from "knex";
import ClientPgLite from "knex-pglite";
import fs from "node:fs";
import path from "node:path";

export type Db = Knex;

function isPG(connectionString: string) {
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

  // If path is not postgres then it is a filesystem path.
  // Ensures parent directory is created.
  if (connectionString && !isPg) {
    const dirPath = path.resolve(connectionString, "..");
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
  return knex({
    client,
    connection,
  });
}
