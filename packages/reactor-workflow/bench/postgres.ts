// A fresh Postgres database per bench run, for the reactor, its worker threads
// and the run journal, as Switchboard wires them against PH_REACTOR_DATABASE_URL.
import type { DbConfig } from "@powerhousedao/reactor";
import {
  createRelationalDb,
  type IRelationalDb,
} from "@powerhousedao/shared/processors";
import knex from "knex";
import { Kysely, PostgresDialect } from "kysely";
import { KyselyKnexDialect, PGColdDialect } from "kysely-knex";
import pg from "pg";

export interface BenchDatabase {
  url: string;
  config(applicationName: string, poolSize: number): DbConfig;
}

export async function freshDatabase(
  baseUrl: string,
  name: string,
): Promise<BenchDatabase> {
  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  await admin.query(`create database "${name}"`);
  await admin.end();
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    config: (applicationName, poolSize) => ({
      host: url.hostname,
      port: url.port ? Number(url.port) : 5432,
      database: name,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      applicationName,
      poolSize,
      connectionTimeoutMillis: 5_000,
    }),
  };
}

// The host's own pool; Switchboard sizes it at 16.
export function hostKysely(config: DbConfig): Kysely<never> {
  return new Kysely<never>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: config.password,
        application_name: config.applicationName,
        max: config.poolSize,
      }),
    }),
  });
}

// The run journal, behind knex as Switchboard's relational database is.
export function journalDb(url: string): IRelationalDb {
  const client = knex({ client: "pg", connection: url, pool: { max: 8 } });
  const kysely = new Kysely<unknown>({
    dialect: new KyselyKnexDialect({
      knex: client,
      kyselySubDialect: new PGColdDialect(),
    }),
  });
  return createRelationalDb(kysely);
}
