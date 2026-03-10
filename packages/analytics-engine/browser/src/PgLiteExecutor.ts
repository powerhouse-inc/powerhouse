import type { PGlite } from "@electric-sql/pglite";
import type { PGliteWorker } from "@electric-sql/pglite/worker";
import {
  type IAnalyticsProfiler,
  type ISqlExecutor,
  type SqlQueryLogger,
  type SqlResultsLogger,
} from "@powerhousedao/analytics-engine-core";

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

export class PGLiteQueryExecutor implements ISqlExecutor {
  private _index: number = 0;
  private _sql: PGlite | PGliteWorker | null = null;

  constructor(
    private readonly _profiler: IAnalyticsProfiler,
    private readonly _queryLogger?: SqlQueryLogger,
    private readonly _resultsLogger?: SqlResultsLogger,
  ) {
    //
  }

  init(sql: PGlite | PGliteWorker) {
    this._sql = sql;
  }

  async execute(raw: string) {
    if (!this._sql) {
      throw new Error("PGLiteQueryExecutor not initialized");
    }

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
