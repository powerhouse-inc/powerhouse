import pkg from 'knex';
import ClientPgLite from "knex-pglite";
const knex = pkg

function isPG(connectionString: string) {
    if(connectionString.startsWith("postgres://")) {
        return true;
    }
    return false;
}

export function getKnexClient(connectionString: string) {
    const isPg = isPG(connectionString);
    const client = isPg ? "pg" : ClientPgLite as typeof knex.Client;
    const connection = connectionString;

  return knex({
    client,
    connection,
  });
}

export function getDrizzleClient(connectionString: string) {

}