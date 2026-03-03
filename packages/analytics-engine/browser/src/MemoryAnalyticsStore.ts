import {
  type IAnalyticsProfiler,
  PassthroughAnalyticsProfiler,
} from "@powerhousedao/analytics-engine-core";
import {
  KnexAnalyticsStore,
  type SqlQueryLogger,
  type SqlResultsLogger,
} from "@powerhousedao/analytics-engine-knex";
import knexFactory from "knex";
import type { Knex } from "knex";
import { parseRawResults, PGLiteQueryExecutor } from "./PgLiteExecutor.js";
import { PGlite } from "@electric-sql/pglite";

const initSql = `

  create table if not exists "AnalyticsSeries"
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
  );

  create unique index if not exists "AnalyticsSeries_pkey"
    on "AnalyticsSeries" (id);

  create index if not exists analyticsseries_end_index
      on "AnalyticsSeries" ("end");

  create index if not exists analyticsseries_fn_index
      on "AnalyticsSeries" (fn);

  create index if not exists analyticsseries_metric_index
      on "AnalyticsSeries" (metric);

  create index if not exists analyticsseries_source_index
      on "AnalyticsSeries" (source);

  create index if not exists analyticsseries_start_index
      on "AnalyticsSeries" (start);

  create index if not exists analyticsseries_unit_index
      on "AnalyticsSeries" (unit);

  create index if not exists analyticsseries_value_index
      on "AnalyticsSeries" (value);

  create table if not exists "AnalyticsDimension"
  (
    id          serial        primary key,
    dimension   varchar(255)  not null,
    path        varchar(255)  not null,
    label       varchar(255),
    icon        varchar(1000),
    description text
  );

  create unique index if not exists "AnalyticsDimension_pkey"
    on "AnalyticsDimension" (id);

  create index if not exists analyticsdimension_dimension_index
      on "AnalyticsDimension" (dimension);

  create index if not exists analyticsdimension_path_index
      on "AnalyticsDimension" (path);

  create table if not exists "AnalyticsSeries_AnalyticsDimension"
  (
    "seriesId"    integer not null
      constraint analyticsseries_analyticsdimension_seriesid_foreign
        references "AnalyticsSeries"
        on delete cascade,
    "dimensionId" integer not null
      constraint analyticsseries_analyticsdimension_dimensionid_foreign
        references "AnalyticsDimension"
        on delete cascade
  );

  create index if not exists analyticsseries_analyticsdimension_dimensionid_index
    on "AnalyticsSeries_AnalyticsDimension" ("dimensionId");

  create index if not exists analyticsseries_analyticsdimension_seriesid_index
      on "AnalyticsSeries_AnalyticsDimension" ("seriesId");

`;

export type MemoryAnalyticsStoreOptions = {
  pgLiteFactory?: () => Promise<PGlite>;
  knex?: Knex;
  queryLogger?: SqlQueryLogger;
  resultsLogger?: SqlResultsLogger;
  profiler?: IAnalyticsProfiler;
};

export class MemoryAnalyticsStore extends KnexAnalyticsStore {
  private _pgLiteFactory: () => Promise<PGlite>;
  private _queryLogger: SqlQueryLogger;
  private _resultsLogger: SqlResultsLogger;
  private _pgExecutor: PGLiteQueryExecutor;
  private _profiler: IAnalyticsProfiler;
  private _sql: PGlite | null = null;

  public constructor({
    knex,
    pgLiteFactory,
    queryLogger,
    resultsLogger,
    profiler,
  }: MemoryAnalyticsStoreOptions = {}) {
    if (!profiler) {
      profiler = new PassthroughAnalyticsProfiler();
    }

    const executor = new PGLiteQueryExecutor(
      profiler,
      queryLogger,
      resultsLogger,
    );

    super({
      executor,
      knex:
        knex ||
        knexFactory({
          client: "pg",
          useNullAsDefault: true,
        }),
    });

    this._pgLiteFactory = pgLiteFactory || PGlite.create;
    this._queryLogger = queryLogger || (() => {});
    this._resultsLogger = resultsLogger || (() => {});
    this._profiler = profiler;
    this._pgExecutor = executor;
  }

  public async init() {
    this._sql = await this._pgLiteFactory();

    // init executor
    this._pgExecutor.init(this._sql);

    // create tables if they do not exist
    await this._sql.exec(initSql);
  }

  public async raw(sql: string) {
    this._queryLogger(-1, sql);

    return await this._profiler.record("QueryRaw", async () => {
      const results = await this._sql?.exec(sql);

      this._resultsLogger(-1, results);

      return parseRawResults(results || []);
    });
  }

  public async destroy() {
    super.destroy();

    this._sql?.close();
  }
}
