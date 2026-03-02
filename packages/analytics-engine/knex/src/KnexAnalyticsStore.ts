import type { Knex } from "knex";
import { DateTime } from "luxon";
import {
  AnalyticsPath,
  type AnalyticsSeries,
  type AnalyticsSeriesInput,
  type AnalyticsSeriesQuery,
  type AnalyticsDimension,
  type IAnalyticsStore,
  type AnalyticsUpdateCallback,
  AnalyticsSubscriptionManager,
} from "@powerhousedao/analytics-engine-core";
import { toPascalCase } from "./util.js";

type DimensionsMap = Record<string, Record<string, number[]>>;

export type AnalyticsSeriesRecord = {
  id: number;
  source: string;
  start: Date;
  end: Date | null;
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
  execute<T extends {}, U>(query: Knex.QueryBuilder<T, U>): Promise<any>;
}

export type KnexAnalyticsStoreOptions = {
  executor: IKnexQueryExecutor;
  knex: Knex;
};

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
    this._knex.destroy();
  }

  public async clearSeriesBySource(
    source: AnalyticsPath,
    cleanUpDimensions: boolean = false,
  ): Promise<number> {
    const query = this._knex("AnalyticsSeries")
      .whereLike("source", source.toString("/%"))
      .delete();

    let result = await this._executor.execute(query);

    if (cleanUpDimensions) {
      result += await this.clearEmptyAnalyticsDimensions();
    }

    this._subscriptionManager.notifySubscribers([source]);

    return result;
  }

  public async clearEmptyAnalyticsDimensions() {
    const query = this._knex("AnalyticsDimension AS AD")
      .whereNotExists((q) =>
        q
          .select("*")
          .from("AnalyticsSeries_AnalyticsDimension AS ASAD")
          .where("ASAD.dimensionId", this._knex.ref("AD.id")),
      )
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
          paths.forEach((p) =>
            q.orWhereLike(`dim_${dimension}`, p.toString("/%")),
          );
          return q;
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
          start: input.start.toJSDate(),
          end: input.end ? input.end.toJSDate() : null,
          source: input.source.toString("/"),
          metric: toPascalCase(input.metric),
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

  private _formatQueryRecords(
    records: AnalyticsSeriesRecord[],
    dimensions: string[],
  ): AnalyticsSeries[] {
    const formatted = records.map((r: AnalyticsSeriesRecord) => {
      const result = {
        id: r.id,
        source: AnalyticsPath.fromString(r.source.slice(0, -1)),
        start: DateTime.fromJSDate(r.start),
        end: r.end ? DateTime.fromJSDate(r.end) : null,
        metric: r.metric,
        value: r.value,
        unit: r.unit,
        fn: r.fn,
        params: r.params,
        dimensions: {} as Record<string, AnalyticsDimension> | any,
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
      .select("*")
      .whereIn("metric", metrics);

    for (const dimension of dimensions) {
      baseQuery.select(this._buildDimensionQuery(dimension));
    }

    if (units && units.length > 0 && units[0] !== "") {
      baseQuery.whereIn("unit", units);
    }

    if (until) {
      baseQuery.where("start", "<", until.toISO());
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
