import { pgDump } from "@electric-sql/pglite-tools/pg_dump";
import type { SortOptions } from "@powerhousedao/design-system/connect";
import { REACTOR_SCHEMA } from "@powerhousedao/reactor";
import { useDatabase, usePGlite } from "@powerhousedao/reactor-browser/connect";
import { sql } from "kysely";
import { useCallback } from "react";

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

      const { limit, offset, sort } = options;
      const tableRef = sql.raw(`${REACTOR_SCHEMA}."${table}"`);

      let query;
      if (sort) {
        const columnRef = sql.raw(`"${sort.column}"`);
        const direction = sort.direction === "desc" ? sql`DESC` : sql`ASC`;
        query = sql<Record<string, unknown>>`
          SELECT * FROM ${tableRef}
          ORDER BY ${columnRef} ${direction}
          LIMIT ${limit} OFFSET ${offset}
        `;
      } else {
        query = sql<Record<string, unknown>>`
          SELECT * FROM ${tableRef}
          LIMIT ${limit} OFFSET ${offset}
        `;
      }

      const result = await query.execute(database);

      const countResult = await sql<{ count: string }>`
        SELECT COUNT(*) as count FROM ${tableRef}
      `.execute(database);
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

    const dump = await pgDump({ pg: pglite });
    const sqlContent = await dump.text();

    const blob = new Blob([sqlContent], { type: "text/sql" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `database-export-${Date.now()}.sql`;
    a.click();
    URL.revokeObjectURL(url);
  }, [pglite]);

  const onImportDb = useCallback(
    async (sqlContent: string) => {
      if (!pglite) return;

      // Use explicit transaction to ensure writable transaction context
      await pglite.transaction(async (tx) => {
        await tx.exec(`DROP SCHEMA ${REACTOR_SCHEMA} CASCADE`);
        await tx.exec(`CREATE SCHEMA ${REACTOR_SCHEMA}`);
        await tx.exec(sqlContent);
        await tx.exec(`SET search_path TO ${REACTOR_SCHEMA}`);
      });
    },
    [pglite],
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
