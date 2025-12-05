import { pgDump } from "@electric-sql/pglite-tools/pg_dump";
import { InspectorModal as ConnectInspectorModal } from "@powerhousedao/design-system/connect";
import { closePHModal, usePHModal } from "@powerhousedao/reactor-browser";
import {
  useDatabase,
  usePGlite,
  useSync,
} from "@powerhousedao/reactor-browser/connect";

import { sql } from "kysely";
import { useCallback } from "react";

const DEFAULT_PAGE_SIZE = 25;

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

type SortOptions = {
  readonly column: string;
  readonly direction: "asc" | "desc";
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

export const InspectorModal: React.FC = () => {
  const phModal = usePHModal();
  const database = useDatabase();
  const pglite = usePGlite();
  const syncManager = useSync();
  const open = phModal?.type === "inspector";

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
      WHERE c.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
      ORDER BY c.table_name, c.ordinal_position
    `.execute(database);

    // Group columns by table name
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

    // Convert map to array of TableInfo
    return Array.from(tableMap).map(([name, columns]) => ({
      name,
      columns,
    }));
  }, [database]);

  const getTableRows = useCallback(
    async (table: string, options: GetTableRowsOptions): Promise<TablePage> => {
      if (!database || !pglite) {
        return { columns: [], rows: [], total: null };
      }

      const { limit, offset, sort } = options;

      // Use explicit schema prefix to avoid search_path issues
      const tableRef = sql.raw(`public."${table}"`);

      // Build the query with optional sorting
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

      // Get total count
      const countResult = await sql<{ count: string }>`
        SELECT COUNT(*) as count FROM ${tableRef}
      `.execute(database);
      const total = countResult.rows[0]
        ? parseInt(countResult.rows[0].count, 10)
        : null;

      // Extract column names from first row or return empty
      const columns = result.rows.length > 0 ? Object.keys(result.rows[0]) : [];

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

      // Drop and recreate public schema to clear all tables
      await pglite.exec(`DROP SCHEMA public CASCADE`);
      await pglite.exec(`CREATE SCHEMA public`);

      // Execute the import
      await pglite.exec(sqlContent);

      // Reset search_path to public after import (pg_dump may change it)
      await pglite.exec(`SET search_path TO public`);
    },
    [pglite],
  );

  const getRemotes = useCallback(() => {
    return Promise.resolve(syncManager?.list() ?? []);
  }, [syncManager]);

  return (
    <ConnectInspectorModal
      open={open}
      onOpenChange={(status) => {
        if (!status) closePHModal();
      }}
      dbExplorerProps={{
        schema: "public",
        getTables,
        getTableRows,
        pageSize: DEFAULT_PAGE_SIZE,
        onExportDb,
        onImportDb,
      }}
      remotesInspectorProps={{
        getRemotes,
      }}
    />
  );
};
