import { PGlite } from "@electric-sql/pglite";
import { type IAnalyticsProfiler } from "@powerhousedao/analytics-engine-core";
import type {
  IKnexQueryExecutor,
  SqlQueryLogger,
  SqlResultsLogger,
} from "@powerhousedao/analytics-engine-knex";
import type { Knex } from "knex";

export const parseRawResults = (rawResults: any[]) => {
  const allValues = [];
  for (const returnValue of rawResults.values() || []) {
    const { fields, rows } = returnValue;
    const values = new Array(rows.length);
    for (let i = 0, iLen = values.length; i < iLen; i++) {
      const row = rows[i];
      const value: any = {};
      for (let j = 0, jLen = fields.length; j < jLen; j++) {
        // todo: switch on dataTypeID
        const { name, dataTypeID } = fields[j];
        value[name] = row[name];
      }

      values[i] = value;
    }

    allValues.push(...values);
  }

  return allValues;
};

export class PGLiteQueryExecutor implements IKnexQueryExecutor {
  private _index: number = 0;
  private _sql: PGlite | null = null;

  constructor(
    private readonly _profiler: IAnalyticsProfiler,
    private readonly _queryLogger?: SqlQueryLogger,
    private readonly _resultsLogger?: SqlResultsLogger,
  ) {
    //
  }

  init(sql: PGlite) {
    this._sql = sql;
  }

  async execute<T extends {}, U>(query: Knex.QueryBuilder<T, U>) {
    if (!this._sql) {
      throw new Error("PGLiteQueryExecutor not initialized");
    }

    const raw = query.toString();
    const index = this._index++;

    if (this._queryLogger) {
      this._queryLogger(index, raw);
    }

    const results: any = await this._profiler.record("Query", async () => {
      const rawResults = await this._sql?.exec(raw);
      if (!rawResults) {
        return;
      }

      const allValues = parseRawResults(rawResults);
      return allValues;
    });

    if (this._resultsLogger) {
      this._resultsLogger(index, results);
    }

    return results;
  }
}
