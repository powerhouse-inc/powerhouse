export type SqlQueryLogger = (index: number, query: string) => void;

export type SqlResultsLogger = (index: number, results: any) => void;

export interface ISqlExecutor {
  execute(rawSql: string, params?: unknown[]): Promise<any>;
}
