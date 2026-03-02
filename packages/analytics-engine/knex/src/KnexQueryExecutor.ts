import { type IAnalyticsProfiler } from "@powerhousedao/analytics-engine-core";
import type { Knex } from "knex";
import { type IKnexQueryExecutor } from "./KnexAnalyticsStore.js";

export class KnexQueryExecutor implements IKnexQueryExecutor {
  private _index: number = 0;

  constructor(
    private readonly _queryLogger?: (index: number, query: string) => void,
    private readonly _resultsLogger?: (index: number, results: any) => void,
    private readonly _profiler?: IAnalyticsProfiler,
  ) {
    if (this._profiler) {
      this._profiler.push("Knex");
    }
  }

  async execute<T extends {}, U>(query: Knex.QueryBuilder<T, U>): Promise<any> {
    const index = this._index++;

    if (this._queryLogger) {
      this._queryLogger(index, query.toString());
    }

    let results;
    if (this._profiler) {
      // profile the query
      results = await this._profiler.record("Query", async () => await query);
    } else {
      results = await query;
    }

    if (this._resultsLogger) {
      this._resultsLogger(index, results);
    }

    return results;
  }
}
