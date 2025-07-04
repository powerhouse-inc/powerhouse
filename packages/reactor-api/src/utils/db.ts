import { PGlite } from "@electric-sql/pglite";
import knex, { type Knex } from "knex";
import ClientPgLite from "knex-pglite";
import { Kysely } from "kysely";
import { KyselyKnexDialect, PGColdDialect } from "kysely-knex";
import fs from "node:fs";
import path from "node:path";

export type Db = Kysely<any>;

function isPG(connectionString: string) {
  if (connectionString.startsWith("postgresql://")) {
    return true;
  }
  return false;
}

export function getDbClient(connectionString: string | undefined = undefined): {
  db: Db;
  knex: Knex;
} {
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

  const knexInstance = knex({
    client,
    connection,
  });

  const kyselyInstance = new Kysely({
    dialect: new KyselyKnexDialect({
      knex: knexInstance,
      kyselySubDialect: new PGColdDialect(),
    }),
  });

  return { db: kyselyInstance, knex: knexInstance };
}

export const initAnalyticsStoreSql = [
  `create table if not exists "AnalyticsSeries"
  (
    id     serial       primary key,
    source varchar(255) not null,
    start  timestamp    not null,
    "end"  timestamp,
    metric varchar(255) not null,
    value  real         not null,
    unit   varchar(255),
    fn     varchar(255) not null,
    params json
  );`,
  `create unique index if not exists "AnalyticsSeries_pkey"
    on "AnalyticsSeries" (id);`,
  `create index if not exists analyticsseries_end_index
      on "AnalyticsSeries" ("end");`,
  `create index if not exists analyticsseries_fn_index
      on "AnalyticsSeries" (fn);`,
  `create index if not exists analyticsseries_metric_index
      on "AnalyticsSeries" (metric);`,
  `create index if not exists analyticsseries_source_index
      on "AnalyticsSeries" (source);`,
  `create index if not exists analyticsseries_start_index
      on "AnalyticsSeries" (start);`,
  `create index if not exists analyticsseries_unit_index
      on "AnalyticsSeries" (unit);`,
  `create index if not exists analyticsseries_value_index
      on "AnalyticsSeries" (value);`,
  `create table if not exists "AnalyticsDimension"
  (
    id          serial        primary key,
    dimension   varchar(255)  not null,
    path        varchar(255)  not null,
    label       varchar(255),
    icon        varchar(1000),
    description text
  );`,
  `create unique index if not exists "AnalyticsDimension_pkey"
    on "AnalyticsDimension" (id);`,
  `create index if not exists analyticsdimension_dimension_index
      on "AnalyticsDimension" (dimension);`,
  `create index if not exists analyticsdimension_path_index
      on "AnalyticsDimension" (path);`,
  `create table if not exists "AnalyticsSeries_AnalyticsDimension"
  (
    "seriesId"    integer not null
      constraint analyticsseries_analyticsdimension_seriesid_foreign
        references "AnalyticsSeries"
        on delete cascade,
    "dimensionId" integer not null
      constraint analyticsseries_analyticsdimension_dimensionid_foreign
        references "AnalyticsDimension"
        on delete cascade
  );`,
  `create index if not exists analyticsseries_analyticsdimension_dimensionid_index
    on "AnalyticsSeries_AnalyticsDimension" ("dimensionId");`,
  `create index if not exists analyticsseries_analyticsdimension_seriesid_index
      on "AnalyticsSeries_AnalyticsDimension" ("seriesId");`,
];
