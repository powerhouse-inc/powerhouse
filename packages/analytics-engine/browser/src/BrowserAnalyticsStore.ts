import type { PGlite } from "@electric-sql/pglite";
import type { PGliteWorker } from "@electric-sql/pglite/worker";
import type {
  AnalyticsDimension,
  AnalyticsSeries,
  AnalyticsSeriesInput,
  AnalyticsSeriesQuery,
  AnalyticsUpdateCallback,
  SqlQueryLogger,
  SqlResultsLogger,
} from "@powerhousedao/analytics-engine-core";
import {
  AnalyticsPath,
  AnalyticsSubscriptionManager,
  type IAnalyticsProfiler,
  type IAnalyticsStore,
  PassthroughAnalyticsProfiler,
} from "@powerhousedao/analytics-engine-core";
import { pascalCase } from "change-case";
import { DateTime } from "luxon";
import { parseRawResults, PGLiteQueryExecutor } from "./PgLiteExecutor.js";

type DimensionsMap = Record<string, Record<string, number[]>>;

type AnalyticsSeriesRecord = {
  id: number;
  source: string;
  start: Date | string;
  end: Date | string | null;
  metric: string;
  value: number;
  unit: string | null;
  fn: string;
  params: Record<string, any> | null;
  [dimension: `dim_${string}`]: string | null | undefined;
  dim_icon?: string | null;
  dim_label?: string | null;
  dim_description?: string | null;
};

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

export type BrowserAnalyticsStoreOptions = {
  pgLite: PGlite | PGliteWorker;
  queryLogger?: SqlQueryLogger;
  resultsLogger?: SqlResultsLogger;
  profiler?: IAnalyticsProfiler;
};

export class BrowserAnalyticsStore implements IAnalyticsStore {
  private _queryLogger: SqlQueryLogger;
  private _resultsLogger: SqlResultsLogger;
  private _pgExecutor: PGLiteQueryExecutor;
  private _profiler: IAnalyticsProfiler;
  private readonly _subscriptionManager = new AnalyticsSubscriptionManager();
  private _pgLite: PGlite | PGliteWorker;

  public constructor({
    pgLite,
    queryLogger,
    resultsLogger,
    profiler,
  }: BrowserAnalyticsStoreOptions) {
    if (!profiler) {
      profiler = new PassthroughAnalyticsProfiler();
    }

    const executor = new PGLiteQueryExecutor(
      profiler,
      queryLogger,
      resultsLogger,
    );

    this._pgLite = pgLite;
    this._queryLogger = queryLogger || (() => {});
    this._resultsLogger = resultsLogger || (() => {});
    this._profiler = profiler;
    this._pgExecutor = executor;
  }

  public async init() {
    // init executor
    this._pgExecutor.init(this._pgLite);

    // create tables if they do not exist
    await this._pgLite.exec(initSql);
  }

  public async raw(sql: string) {
    this._queryLogger(-1, sql);

    return await this._profiler.record("QueryRaw", async () => {
      const results = await this._pgLite.exec(sql);

      this._resultsLogger(-1, results);

      return parseRawResults(results || []);
    });
  }

  public async destroy() {
    this._pgLite.close();
  }

  public async getDimensions(): Promise<any> {
    const result = await this._pgLite.query<{
      dimension: string;
      path: string;
      icon: string | null;
      label: string | null;
      description: string | null;
    }>(`
    select "dimension", "path", "icon", "label", "description"
    from "AnalyticsDimension"
    where "path" is not null
      and "path" <> ''
      and "path" <> '/'
  `);

    if (!Array.isArray(result.rows)) return [];

    const grouped = result.rows.reduce(
      (
        acc: Record<
          string,
          | {
              name: string;
              values: {
                path: string;
                icon: string | null;
                label: string | null;
                description: string | null;
              }[];
            }
          | undefined
        >,
        row,
      ) => {
        if (!acc[row.dimension]) {
          acc[row.dimension] = {
            name: row.dimension,
            values: [],
          };
        }

        acc[row.dimension]?.values.push({
          path: row.path,
          icon: row.icon,
          label: row.label,
          description: row.description,
        });

        return acc;
      },
      {},
    );

    return Object.values(grouped);
  }

  public async getMatchingSeries(
    query: AnalyticsSeriesQuery,
  ): Promise<AnalyticsSeries<string | AnalyticsDimension>[]> {
    const units = query.currency ? query.currency.firstSegment().filters : null;
    const dimensions = Object.keys(query.select);

    const params: unknown[] = [];
    const innerSelects: string[] = [
      `"AS_inner"."id"`,
      `"AS_inner"."source"`,
      `"AS_inner"."start"`,
      `"AS_inner"."end"`,
      `"AS_inner"."metric"`,
      `"AS_inner"."value"`,
      `"AS_inner"."unit"`,
      `"AS_inner"."fn"`,
      `"AS_inner"."params"`,
    ];
    const innerWheres: string[] = [];
    const outerSelects: string[] = [`"AV".*`];
    const outerJoins: string[] = [];
    const outerWheres: string[] = [];

    params.push(query.metrics);
    innerWheres.push(`"AS_inner"."metric" = any($${params.length}::text[])`);

    if (units && units.length > 0 && units[0] !== "") {
      params.push(units);
      innerWheres.push(`"AS_inner"."unit" = any($${params.length}::text[])`);
    }

    if (query.end) {
      params.push(query.end.toISO());
      innerWheres.push(`"AS_inner"."start" < $${params.length}`);
    }

    for (const dimension of dimensions) {
      params.push(dimension);
      innerSelects.push(`
      (
        select "AD"."path"
        from "AnalyticsSeries_AnalyticsDimension" as "ASAD"
        left join "AnalyticsDimension" as "AD"
          on "AD"."id" = "ASAD"."dimensionId"
        where "ASAD"."seriesId" = "AS_inner"."id"
          and "AD"."dimension" = $${params.length}
        limit 1
      ) as "dim_${dimension}"
    `);
    }

    for (const [dimension, paths] of Object.entries(query.select)) {
      outerJoins.push(`
      left join "AnalyticsDimension" as "${dimension}"
        on "${dimension}"."path" = "AV"."dim_${dimension}"
    `);

      outerSelects.push(
        `"${dimension}"."icon" as "dim_icon"`,
        `"${dimension}"."description" as "dim_description"`,
        `"${dimension}"."label" as "dim_label"`,
      );

      if (paths.length === 1) {
        params.push(paths[0].toString("/%"));
        outerWheres.push(`"AV"."dim_${dimension}" like $${params.length}`);
      } else if (paths.length > 1) {
        const orParts: string[] = [];

        for (const path of paths) {
          params.push(path.toString("/%"));
          orParts.push(`"AV"."dim_${dimension}" like $${params.length}`);
        }

        outerWheres.push(`(${orParts.join(" or ")})`);
      }
    }

    const sql = `
    select
      ${outerSelects.join(",\n      ")}
    from (
      select
        ${innerSelects.join(",\n        ")}
      from "AnalyticsSeries" as "AS_inner"
      where ${innerWheres.join("\n        and ")}
    ) as "AV"
    ${outerJoins.join("\n")}
    ${outerWheres.length ? `where ${outerWheres.join("\n      and ")}` : ""}
    order by "AV"."start"
  `;

    const result = await this._pgLite.query<AnalyticsSeriesRecord>(sql, params);

    return this._formatQueryRecords(result.rows, dimensions);
  }

  public async clearEmptyAnalyticsDimensions(): Promise<number> {
    const result = await this._pgLite.query<{ id: number }>(
      `
      delete from "AnalyticsDimension" as "AD"
      where not exists (
        select 1
        from "AnalyticsSeries_AnalyticsDimension" as "ASAD"
        where "ASAD"."dimensionId" = "AD"."id"
      )
      returning "id"
    `,
    );

    return result.rows.length;
  }

  public async clearSeriesBySource(
    source: AnalyticsPath,
    cleanUpDimensions: boolean = false,
  ): Promise<number> {
    const result = await this._pgLite.query<{ id: number }>(
      `
      delete from "AnalyticsSeries"
      where "source" like $1
      returning "id"
    `,
      [source.toString("/%")],
    );

    let deletedCount = result.rows.length;

    if (cleanUpDimensions) {
      deletedCount += await this.clearEmptyAnalyticsDimensions();
    }

    this._subscriptionManager.notifySubscribers([source]);

    return deletedCount;
  }

  private async _addDimensionMetadata(
    path: string,
    icon: string | null | undefined,
    label: string | null | undefined,
    description: string | null | undefined,
  ): Promise<void> {
    if (!icon && !label && !description) {
      return;
    }

    await this._pgLite.query(
      `
      update "AnalyticsDimension"
      set
        "icon" = $1,
        "label" = $2,
        "description" = $3
      where "path" = $4
    `,
      [
        icon ? icon : "",
        label ? label : "",
        description ? description : "",
        `${path.toString()}/`,
      ],
    );
  }

  private _formatQueryRecords(
    records: AnalyticsSeriesRecord[],
    dimensions: string[],
  ): AnalyticsSeries<string | AnalyticsDimension>[] {
    const formatted = records.map((r) => {
      const start = r.start instanceof Date ? r.start : new Date(r.start);
      const end =
        r.end == null ? null : r.end instanceof Date ? r.end : new Date(r.end);

      const result = {
        id: r.id,
        source: AnalyticsPath.fromString(r.source.slice(0, -1)),
        start: DateTime.fromJSDate(start),
        end: end ? DateTime.fromJSDate(end) : null,
        metric: r.metric,
        value: r.value,
        unit: r.unit,
        fn: r.fn,
        params: r.params,
        dimensions: {} as Record<string, AnalyticsDimension>,
      };

      dimensions.forEach((dimension) => {
        const dimPath = r[`dim_${dimension}`];

        result.dimensions[dimension] = {
          path: AnalyticsPath.fromString(dimPath ? dimPath.slice(0, -1) : "?"),
          icon: r.dim_icon ? r.dim_icon : "",
          label: r.dim_label ? r.dim_label : "",
          description: r.dim_description ? r.dim_description : "",
        };
      });

      return result;
    });

    return formatted.sort((a, b) => a.id - b.id);
  }

  public async addSeriesValues(inputs: AnalyticsSeriesInput[]): Promise<void> {
    const dimensionsMap: DimensionsMap = {};

    for (const input of inputs) {
      const result = await this._pgLite.query<{ id: number }>(
        `
        insert into "AnalyticsSeries" (
          "start",
          "end",
          "source",
          "metric",
          "value",
          "unit",
          "fn",
          "params"
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8)
        returning "id"
      `,
        [
          input.start.toJSDate(),
          input.end ? input.end.toJSDate() : null,
          input.source.toString("/"),
          pascalCase(input.metric),
          input.value,
          input.unit || null,
          input.fn || "Single",
          input.params || null,
        ],
      );

      const seriesId = result.rows[0]?.id;

      if (seriesId == null) {
        throw new Error("Failed to insert AnalyticsSeries row");
      }

      for (const [dim, path] of Object.entries(input.dimensions || {})) {
        if (!dimensionsMap[dim]) {
          dimensionsMap[dim] = {};
        }

        const pathKey = path.toString("/");

        if (!dimensionsMap[dim][pathKey]) {
          dimensionsMap[dim][pathKey] = [];
        }

        dimensionsMap[dim][pathKey].push(seriesId);
      }
    }

    for (const [dim, pathMap] of Object.entries(dimensionsMap)) {
      await this._linkDimensions(dim, pathMap);
    }

    for (const input of inputs) {
      const metaDimension: any = input.dimensionMetadata;

      if (!metaDimension) {
        continue;
      }

      await this._addDimensionMetadata(
        metaDimension.path,
        metaDimension.icon,
        metaDimension.label,
        metaDimension.description,
      );
    }

    this._subscriptionManager.notifySubscribers(
      inputs.map((input) => input.source),
    );
  }

  private async _createDimensionPath(
    dimension: string,
    path: string,
  ): Promise<number> {
    const result = await this._pgLite.query<{ id: number | null }>(
      `
      insert into "AnalyticsDimension" ("dimension", "path")
      values ($1, $2)
      returning "id"
    `,
      [dimension, path],
    );

    const id = result.rows[0]?.id;

    if (id == null) {
      throw new Error("Failed to create AnalyticsDimension");
    }

    return id;
  }

  private async _linkDimensions(
    dimension: string,
    pathMap: Record<string, number[]>,
  ): Promise<void> {
    const paths = Object.keys(pathMap);

    if (paths.length === 0) {
      return;
    }

    const existingResult = await this._pgLite.query<{
      path: string;
      id: number;
    }>(
      `
      select "path", "id"
      from "AnalyticsDimension"
      where "dimension" = $1
        and "path" = any($2::text[])
    `,
      [dimension, paths],
    );

    const existing = existingResult.rows;

    for (const [path, ids] of Object.entries(pathMap)) {
      const existingRecord = existing.find((record) => record.path === path);

      const dimensionId = existingRecord
        ? existingRecord.id
        : await this._createDimensionPath(dimension, path);

      for (const seriesId of ids) {
        await this._pgLite.query(
          `
          insert into "AnalyticsSeries_AnalyticsDimension" (
            "seriesId",
            "dimensionId"
          )
          values ($1, $2)
        `,
          [seriesId, dimensionId],
        );
      }
    }
  }

  public async addSeriesValue(input: AnalyticsSeriesInput): Promise<void> {
    await this.addSeriesValues([input]);
  }

  public subscribeToSource(
    source: AnalyticsPath,
    callback: AnalyticsUpdateCallback,
  ): () => void {
    return this._subscriptionManager.subscribeToPath(source, callback);
  }
}
