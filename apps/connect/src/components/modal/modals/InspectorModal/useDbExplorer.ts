import {
  getCachedReactorPgMajor,
  loadPgDump,
  resolvePgMajorForRuntime,
} from "@powerhousedao/connect/utils";
import type {
  FilterGroup,
  SortOptions,
} from "@powerhousedao/design-system/connect";
import {
  REACTOR_SCHEMA,
  useDatabase,
  usePGlite,
  useReactorClientModule,
  type IQueue,
} from "@powerhousedao/reactor-browser";
import { sql } from "kysely";
import { useCallback } from "react";

async function quiesceQueue(queue: IQueue): Promise<void> {
  await new Promise<void>((resolve) => queue.block(() => resolve()));
}

// The reactor runs with `relaxedDurability: true`, which makes PGlite's
// `syncToFs()` fire the IDBFS→IndexedDB write and return without awaiting
// Emscripten's syncfs callback. `close()` also doesn't flush. Calling
// `FS.syncfs(false, cb)` directly gives us a callback that fires from the
// IDBFS transaction's `oncomplete` — i.e. after IDB has actually committed.
async function syncPgliteToIdb(pglite: {
  readonly Module: {
    readonly FS: {
      syncfs(populate: boolean, cb: (err: Error | null) => void): void;
    };
  };
}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    pglite.Module.FS.syncfs(false, (err) => (err ? reject(err) : resolve()));
  });
}

type ColumnInfo = {
  readonly name: string;
  readonly dataType: string;
  readonly isNullable: boolean;
};

type TableInfo = {
  readonly name: string;
  readonly columns: ColumnInfo[];
};

type ColumnRow = {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
};

type GetTableRowsOptions = {
  readonly schema?: string;
  readonly limit: number;
  readonly offset: number;
  readonly sort?: SortOptions;
  readonly filters?: FilterGroup;
};

type TablePage = {
  readonly columns: string[];
  readonly rows: Record<string, unknown>[];
  readonly total: number | null;
};

const PRIORITY_COLUMNS = [
  "documentType",
  "documentId",
  "scope",
  "branch",
  "index",
  "skip",
] as const;

export function useDbExplorer() {
  const database = useDatabase();
  const pglite = usePGlite();
  const reactorClientModule = useReactorClientModule();
  const reactor = reactorClientModule?.reactorModule?.reactor;
  const queue = reactorClientModule?.reactorModule?.queue;

  const getTables = useCallback(async (): Promise<TableInfo[]> => {
    if (!database) return [];

    const result = await sql<ColumnRow>`
      SELECT
        c.table_name,
        c.column_name,
        c.data_type,
        c.is_nullable
      FROM information_schema.columns c
      INNER JOIN information_schema.tables t
        ON c.table_name = t.table_name
        AND c.table_schema = t.table_schema
      WHERE c.table_schema = ${REACTOR_SCHEMA}
        AND t.table_type = 'BASE TABLE'
      ORDER BY c.table_name, c.ordinal_position
    `.execute(database);

    const tableMap = new Map<string, ColumnInfo[]>();
    for (const row of result.rows) {
      if (!tableMap.has(row.table_name)) {
        tableMap.set(row.table_name, []);
      }
      tableMap.get(row.table_name)!.push({
        name: row.column_name,
        dataType: row.data_type,
        isNullable: row.is_nullable === "YES",
      });
    }

    return Array.from(tableMap).map(([name, columns]) => {
      const columnNames = columns.map((col) => col.name);
      const orderedColumns = [
        ...PRIORITY_COLUMNS.filter((col) => columnNames.includes(col)).map(
          (col) => columns.find((c) => c.name === col)!,
        ),
        ...columns.filter(
          (col) =>
            !PRIORITY_COLUMNS.includes(
              col.name as (typeof PRIORITY_COLUMNS)[number],
            ),
        ),
      ];
      return {
        name,
        columns: orderedColumns,
      };
    });
  }, [database]);

  const getTableRows = useCallback(
    async (table: string, options: GetTableRowsOptions): Promise<TablePage> => {
      if (!database) {
        return { columns: [], rows: [], total: null };
      }

      const limit = options.limit;
      const offset = options.offset;
      const sort = options.sort;
      const filters = options.filters;
      const tableRef = sql.raw(`${REACTOR_SCHEMA}."${table}"`);

      // Build WHERE clause from filters
      let whereClause = sql``;
      if (filters?.clauses && filters.clauses.length > 0) {
        const conditions: ReturnType<typeof sql>[] = [];

        for (let i = 0; i < filters.clauses.length; i++) {
          const clause = filters.clauses[i];
          if (!clause) continue;

          const columnRef = sql.raw(`"${clause.column}"`);

          let condition: ReturnType<typeof sql>;

          if (clause.operator === "IS NULL") {
            condition = sql`${columnRef} IS NULL`;
          } else if (clause.operator === "IS NOT NULL") {
            condition = sql`${columnRef} IS NOT NULL`;
          } else if (
            clause.operator === "LIKE" ||
            clause.operator === "ILIKE"
          ) {
            const value = clause.value;
            const operator =
              clause.operator === "LIKE" ? sql`LIKE` : sql`ILIKE`;
            condition = sql`${columnRef} ${operator} ${value}`;
          } else {
            // For =, !=, >, <, >=, <=
            const operator = sql.raw(clause.operator);
            const value = clause.value;

            // Try to parse as number if it looks like a number
            let parsedValue: string | number = value;
            if (value !== "" && !isNaN(Number(value)) && value.trim() !== "") {
              parsedValue = Number(value);
            }

            condition = sql`${columnRef} ${operator} ${parsedValue}`;
          }

          conditions.push(condition);

          // Add connector if not the last clause
          if (i < filters.clauses.length - 1) {
            const connector = filters.connectors?.[i] ?? "AND";
            conditions.push(sql.raw(connector));
          }
        }

        // Combine all conditions
        if (conditions.length > 0) {
          whereClause = sql`WHERE ${sql.join(conditions, sql` `)}`;
        }
      }

      // Build main query
      let query;
      if (sort) {
        const columnRef = sql.raw(`"${sort.column}"`);
        const direction = sort.direction === "desc" ? sql`DESC` : sql`ASC`;
        query = sql<Record<string, unknown>>`
          SELECT * FROM ${tableRef}
          ${whereClause}
          ORDER BY ${columnRef} ${direction}
          LIMIT ${limit} OFFSET ${offset}
        `;
      } else {
        query = sql<Record<string, unknown>>`
          SELECT * FROM ${tableRef}
          ${whereClause}
          LIMIT ${limit} OFFSET ${offset}
        `;
      }

      const result = await query.execute(database);

      // Build count query with same filters
      const countQuery = sql<{ count: string }>`
        SELECT COUNT(*) as count FROM ${tableRef}
        ${whereClause}
      `;
      const countResult = await countQuery.execute(database);
      const total = countResult.rows[0]
        ? parseInt(countResult.rows[0].count, 10)
        : null;

      const rawColumns =
        result.rows.length > 0 ? Object.keys(result.rows[0]) : [];
      const columns = [
        ...PRIORITY_COLUMNS.filter((col) => rawColumns.includes(col)),
        ...rawColumns.filter(
          (col) =>
            !PRIORITY_COLUMNS.includes(
              col as (typeof PRIORITY_COLUMNS)[number],
            ),
        ),
      ];

      return {
        columns,
        rows: result.rows,
        total,
      };
    },
    [database],
  );

  const onExportDb = useCallback(async () => {
    if (!pglite) return;

    if (queue) await quiesceQueue(queue);

    try {
      const major = resolvePgMajorForRuntime(getCachedReactorPgMajor() ?? null);
      const pgDump = await loadPgDump(major);
      const dump = await pgDump({ pg: pglite });
      const sqlContent = await dump.text();

      const blob = new Blob([sqlContent], { type: "text/sql" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `database-export-${Date.now()}.sql`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      queue?.unblock();
    }
  }, [pglite, queue]);

  const onImportDb = useCallback(
    async (sqlContent: string) => {
      if (!pglite) return;

      if (queue) await quiesceQueue(queue);

      if (reactor) {
        const status = reactor.kill();
        await status.completed;
      }

      // Drop every user-created schema before restoring. Processors may own
      // schemas beyond `reactor`, so dropping only that one leaves orphans
      // whose tables collide with whatever the dump recreates. The dump
      // itself emits `CREATE SCHEMA ...;` statements, so we don't pre-create.
      // `standard_conforming_strings=off` matches pg_dump's escape-string
      // literals so doubled backslashes in JSONB collapse correctly.
      await pglite.transaction(async (tx) => {
        const schemas = await tx.query<{ nspname: string }>(
          `SELECT nspname FROM pg_namespace
           WHERE nspname NOT IN ('pg_catalog', 'pg_toast', 'information_schema', 'public')
             AND nspname NOT LIKE 'pg_temp_%'
             AND nspname NOT LIKE 'pg_toast_temp_%'`,
        );
        for (const { nspname } of schemas.rows) {
          await tx.exec(`DROP SCHEMA IF EXISTS "${nspname}" CASCADE`);
        }
        try {
          await tx.exec("SET standard_conforming_strings = off;");
        } catch {
          // PG17 still accepts this but log if it ever fails.
        }
        await tx.exec(sqlContent);
        await tx.exec(`SET search_path TO ${REACTOR_SCHEMA}`);
      });

      // Flush IDBFS → IndexedDB synchronously. PGlite's own syncToFs is
      // fire-and-forget under relaxedDurability, and close() doesn't run
      // a final sync, so we drive Emscripten's syncfs directly — its
      // callback fires from the IDB transaction's oncomplete, guaranteeing
      // the writes have committed before we reload.
      await syncPgliteToIdb(pglite);

      window.location.reload();
      // reload() is asynchronous; without blocking here the DBExplorer caller
      // would continue and call loadTables() against an in-flight shutdown.
      await new Promise(() => {});
    },
    [pglite, queue, reactor],
  );

  const getDefaultSort = useCallback(
    (table: string): SortOptions | undefined => {
      if (table === "Operation") {
        return { column: "timestampUtcMs", direction: "desc" };
      }
      return undefined;
    },
    [],
  );

  return {
    getTables,
    getTableRows,
    getDefaultSort,
    onExportDb,
    onImportDb,
  };
}
