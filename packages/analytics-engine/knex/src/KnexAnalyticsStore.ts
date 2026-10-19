import {
  AnalyticsPath,
  AnalyticsSubscriptionManager,
  type AnalyticsDimension,
  type AnalyticsSeries,
  type AnalyticsSeriesInput,
  type AnalyticsSeriesQuery,
  type AnalyticsUpdateCallback,
  type IAnalyticsStore,
} from "@powerhousedao/analytics-engine-core";
import { pascalCase } from "change-case";
import type { Knex } from "knex";
import { DateTime } from "luxon";

type DimensionsMap = Record<string, Record<string, number[]>>;

export type AnalyticsSeriesRecord = {
  id: number;
  source: string;
  start: Date | string;
  end: Date | string | null;
  metric: string;
  value: number;
  unit: string | null;
  fn: string;
  params: Record<string, any> | null;
  [dimension: `dim_${string}`]: string;
  dimensionMetadata?: Record<string, string>;
};

/**
 * Using an interface here, so that a null implementation can be used in production,
 * without the added overhead of calling toString().
 */
export interface IQuery {
  toString(): string;
}

export interface IKnexQueryExecutor {
  execute<T extends object, U>(query: Knex.QueryBuilder<T, U>): Promise<any>;
}

export type KnexAnalyticsStoreOptions = {
  executor: IKnexQueryExecutor;
  knex: Knex;
};

/**
 * Timestamp convention: the naive `timestamp` columns (`start`, `end`) hold
 * UTC wall-clock values. Every DateTime crossing into SQL is rendered as an
 * explicit UTC ISO string (never bound as a JS Date, which node-postgres
 * serializes as host-local wall clock), and the columns are read back as text
 * and parsed as UTC. This mirrors BrowserAnalyticsStore, so both stores agree
 * on the same logical data regardless of host timezone.
 *
 * Migration consideration: earlier versions bound JS Dates, so rows written
 * on a non-UTC host were stored shifted by that host's UTC offset and, under
 * this convention, read back shifted by the same amount. Deployments that
 * always ran on UTC hosts are unaffected. Others need a one-time UPDATE
 * shifting the affected rows by the known historical offset, which only the
 * operator can decide. See MIGRATION.md in this package.
 */
export class KnexAnalyticsStore implements IAnalyticsStore {
  protected readonly _executor: IKnexQueryExecutor;
  protected readonly _knex: Knex;
  private readonly _subscriptionManager: AnalyticsSubscriptionManager =
    new AnalyticsSubscriptionManager();

  public constructor({ executor, knex }: KnexAnalyticsStoreOptions) {
    this._executor = executor;
    this._knex = knex;
  }

  public destroy() {
    // Fire-and-forget: the synchronous `destroy()` signature is part of this
    // store's existing contract (callers don't await it), so close the pool
    // without blocking. `void` marks the floating promise as intentional.
    void this._knex.destroy();
  }

  public async clearSeriesBySource(
    source: AnalyticsPath,
    cleanUpDimensions: boolean = false,
  ): Promise<number> {
    const query = this._knex("AnalyticsSeries")
      .whereLike("source", source.toString("/%"))
      .delete();

    let result: number = await this._executor.execute(query);

    if (cleanUpDimensions) {
      result += await this.clearEmptyAnalyticsDimensions();
    }

    this._subscriptionManager.notifySubscribers([source]);

    return result;
  }

  public async clearEmptyAnalyticsDimensions() {
    const query = this._knex("AnalyticsDimension AS AD")
      .whereNotExists((q) => {
        void q
          .select("*")
          .from("AnalyticsSeries_AnalyticsDimension AS ASAD")
          .where("ASAD.dimensionId", this._knex.ref("AD.id"));
      })
      .delete();

    return await this._executor.execute(query);
  }

  public async getMatchingSeries(
    query: AnalyticsSeriesQuery,
  ): Promise<AnalyticsSeries[]> {
    const units = query.currency ? query.currency.firstSegment().filters : null;
    const analyticsView = this._buildViewQuery(
      "AV",
      Object.keys(query.select),
      query.metrics.map((m) => m),
      units,
      query.end,
    );

    const baseQuery = this._knex<AnalyticsSeriesRecord>(
      this._knex.raw(analyticsView),
    ).select("AV.*");

    // Add dimension filter(s)
    for (const [dimension, paths] of Object.entries(query.select)) {
      baseQuery.leftJoin(`AnalyticsDimension as ${dimension}`, (q) => {
        q.on(`${dimension}.path`, `dim_${dimension}`);
      });
      baseQuery.select(`${dimension}.icon as dim_icon`);
      baseQuery.select(`${dimension}.description as dim_description`);
      baseQuery.select(`${dimension}.label as dim_label`);
      if (paths.length == 1) {
        baseQuery.andWhereLike(`dim_${dimension}`, paths[0].toString("/%"));
      } else if (paths.length > 1) {
        baseQuery.andWhere((q) => {
          paths.forEach((p) => {
            void q.orWhereLike(`dim_${dimension}`, p.toString("/%"));
          });
        });
      }
    }
    baseQuery.orderBy("start");

    const results = await this._executor.execute(baseQuery);
    return this._formatQueryRecords(results, Object.keys(query.select));
  }

  public async addSeriesValue(input: AnalyticsSeriesInput) {
    return this.addSeriesValues([input]);
  }

  public async addSeriesValues(inputs: AnalyticsSeriesInput[]) {
    const dimensionsMap: DimensionsMap = {};

    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      const query = this._knex<AnalyticsSeriesRecord>("AnalyticsSeries").insert(
        {
          // Render the UTC wall clock explicitly: a JS Date binding would be
          // serialized by node-postgres as host-local wall clock, storing a
          // zone-dependent value in the naive column.
          start: this._toUtcIso(input.start),
          end: input.end ? this._toUtcIso(input.end) : null,
          source: input.source.toString("/"),
          metric: pascalCase(input.metric),
          value: input.value,
          unit: input.unit || null,
          fn: input.fn || "Single",
          params: input.params || null,
        },
        "id",
      );

      const record = await this._executor.execute(query);
      for (const [dim, path] of Object.entries(inputs[i].dimensions || {})) {
        if (!dimensionsMap[dim]) {
          dimensionsMap[dim] = {};
        }

        const pKey = path.toString("/");
        if (!dimensionsMap[dim][pKey]) {
          dimensionsMap[dim][pKey] = [];
        }

        dimensionsMap[dim][pKey].push(record[0].id);
      }
    }

    for (const [dim, pathMap] of Object.entries(dimensionsMap)) {
      await this._linkDimensions(dim, pathMap);
    }

    // Adding dimension metadata
    for (let i = 0; i < inputs.length; i++) {
      const metaDimension: any = inputs[i].dimensionMetadata;
      if (!metaDimension) {
        continue;
      }
      await this.addDimensionMetadata(
        metaDimension.path,
        metaDimension.icon,
        metaDimension.label,
        metaDimension.description,
      );
    }

    // notify subscribers about updates
    const sourcePaths = inputs.map((input) => input.source);
    this._subscriptionManager.notifySubscribers(sourcePaths);
  }

  /**
   * Renders the UTC wall clock of a DateTime for binding into SQL against
   * the naive timestamp columns. See the timestamp convention on the class.
   */
  private _toUtcIso(value: DateTime): string {
    const iso = value.toUTC().toISO();
    if (iso === null) {
      throw new Error(`Cannot bind invalid DateTime: ${value.invalidReason}`);
    }
    return iso;
  }

  private _formatQueryRecords(
    records: AnalyticsSeriesRecord[],
    dimensions: string[],
  ): AnalyticsSeries[] {
    // The timestamp columns hold naive UTC wall-clock values. Strings come
    // from the ::text casts in _buildViewQuery and are parsed as UTC. A
    // Date can only come from node-postgres's default parser, which
    // interpreted the naive value in host-local time; rebuild the UTC
    // instant from the local wall-clock fields it produced.
    const toUtcDateTime = (value: Date | string): DateTime =>
      value instanceof Date
        ? DateTime.utc(
            value.getFullYear(),
            value.getMonth() + 1,
            value.getDate(),
            value.getHours(),
            value.getMinutes(),
            value.getSeconds(),
            value.getMilliseconds(),
          )
        : DateTime.fromSQL(value, { zone: "utc" });

    const formatted = records.map((r: AnalyticsSeriesRecord) => {
      const result = {
        id: r.id,
        source: AnalyticsPath.fromString(r.source.slice(0, -1)),
        start: toUtcDateTime(r.start),
        end: r.end == null ? null : toUtcDateTime(r.end),
        metric: r.metric,
        value: r.value,
        unit: r.unit,
        fn: r.fn,
        params: r.params,
        dimensions: {} as Record<string, AnalyticsDimension>,
      };

      dimensions.forEach(
        (d) =>
          (result.dimensions[d] = {
            path: AnalyticsPath.fromString(
              r[`dim_${d}`] ? r[`dim_${d}`].slice(0, -1) : "?",
            ),
            icon: r[`dim_icon`] ? r[`dim_icon`] : "",
            label: r[`dim_label`] ? r[`dim_label`] : "",
            description: r[`dim_description`] ? r[`dim_description`] : "",
          }),
      );
      return result;
    });

    // sort by id
    return formatted.sort((a, b) => a.id - b.id);
  }

  private _buildViewQuery(
    name: string,
    dimensions: string[],
    metrics: string[],
    units: string[] | null,
    until: DateTime | null,
  ) {
    const baseQuery = this._knex("AnalyticsSeries as AS_inner")
      .select(
        "AS_inner.id",
        "AS_inner.source",
        // The timestamp columns hold naive UTC wall-clock values, but
        // node-postgres's default parser interprets them in host-local
        // time, which shifts every instant on a non-UTC host. Select them
        // as text and parse them as UTC in _formatQueryRecords instead.
        this._knex.raw(`"AS_inner"."start"::text as "start"`),
        this._knex.raw(`"AS_inner"."end"::text as "end"`),
        "AS_inner.metric",
        "AS_inner.value",
        "AS_inner.unit",
        "AS_inner.fn",
        "AS_inner.params",
      )
      .whereIn("metric", metrics);

    for (const dimension of dimensions) {
      baseQuery.select(this._buildDimensionQuery(dimension));
    }

    if (units && units.length > 0 && units[0] !== "") {
      baseQuery.whereIn("unit", units);
    }

    if (until) {
      // The column holds naive UTC wall-clock values; compare against the
      // UTC rendering of the bound, not a zoned ISO string whose offset a
      // timestamp comparison would drop.
      baseQuery.where("start", "<", this._toUtcIso(until));
    }

    return `(${baseQuery.toString()}) AS "${name}"`;
  }

  private _buildDimensionQuery(dimension: string) {
    const seriesIdRef = this._knex.ref("AS_inner.id");

    return this._knex("AnalyticsSeries_AnalyticsDimension as ASAD")
      .leftJoin("AnalyticsDimension as AD", "AD.id", "ASAD.dimensionId")
      .where("ASAD.seriesId", seriesIdRef)
      .where("AD.dimension", dimension)
      .select("path")
      .as(`dim_${dimension}`);
  }

  private async _linkDimensions(
    dimension: string,
    pathMap: Record<string, number[]>,
  ) {
    const query = this._knex("AnalyticsDimension")
      .select("path", "id")
      .where("dimension", dimension)
      .whereIn("path", Object.keys(pathMap));

    const dimensionIds = await this._executor.execute(query);

    for (const [path, ids] of Object.entries(pathMap)) {
      const i = dimensionIds.findIndex((record: any) => record.path == path);

      const dimensionId =
        i < 0
          ? await this._createDimensionPath(dimension, path)
          : dimensionIds[i].id;

      for (let j = 0; j < ids.length; j++) {
        const query = this._knex("AnalyticsSeries_AnalyticsDimension").insert({
          seriesId: ids[j],
          dimensionId,
        });

        await this._executor.execute(query);
      }
    }
  }

  private async _createDimensionPath(dimension: string, path: string) {
    const query = this._knex("AnalyticsDimension").insert(
      { dimension, path },
      "id",
    );

    const result = await this._executor.execute(query);
    return result[0].id;
  }

  private async addDimensionMetadata(
    path: string,
    icon: string | null | undefined,
    label: string | null | undefined,
    description: string | null | undefined,
  ) {
    if (!icon && !label && !description) {
      return;
    }
    const query = this._knex("AnalyticsDimension")
      .where("path", `${path.toString()}/`)
      .update({
        icon: icon ? icon : "",
        label: label ? label : "",
        description: description ? description : "",
      });

    await this._executor.execute(query);
  }

  public async getDimensions() {
    // Fetch all rows from the database
    const query = this._knex
      .select("dimension", "path", "icon", "label", "description")
      .from("AnalyticsDimension")
      .whereNotNull("path")
      .whereNot("path", "")
      .whereNot("path", "/");

    const rows = await this._executor.execute(query);

    // Process the rows to group them by dimension and format them
    const grouped = rows.reduce((acc: any, row: any) => {
      // If the dimension is not yet in the accumulator, add it
      if (!acc[row.dimension]) {
        acc[row.dimension] = {
          name: row.dimension,
          values: [],
        };
      }

      // Add the path, icon, label, and description to the dimension's values
      acc[row.dimension].values.push({
        path: row.path,
        icon: row.icon,
        label: row.label,
        description: row.description,
      });

      return acc;
    }, {});

    // Convert the grouped object to an array
    const dimensionPaths: any = Object.values(grouped);
    return dimensionPaths;
  }

  public async getMetrics() {
    const query = this._knex("AnalyticsSeries")
      .select("metric")
      .distinct()
      .whereNotNull("metric");

    const list = await this._executor.execute(query);
    const filtered = list.map((l: any) => l.metric);
    const metrics = [
      "Budget",
      "Forecast",
      "Actuals",
      "PaymentsOnChain",
      "PaymentsOffChainIncluded",
    ];
    metrics.forEach((metric) => {
      if (!filtered.includes(metric)) {
        filtered.push(metric);
      }
    });
    return filtered;
  }

  public async getCurrencies() {
    const query = this._knex("AnalyticsSeries")
      .select("unit")
      .distinct()
      .whereNotNull("unit");

    const currencies = await this._executor.execute(query);
    return currencies.map((c: any) => c.unit);
  }

  public subscribeToSource(
    path: AnalyticsPath,
    callback: AnalyticsUpdateCallback,
  ): () => void {
    return this._subscriptionManager.subscribeToPath(path, callback);
  }
}
