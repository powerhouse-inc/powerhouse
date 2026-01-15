import { pgDump } from "@electric-sql/pglite-tools/pg_dump";
import type {
  FilterGroup,
  SortOptions,
} from "@powerhousedao/design-system/connect";
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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const filters = options.filters;
      const tableRef = sql.raw(`${REACTOR_SCHEMA}."${table}"`);

      // Build WHERE clause from filters
      let whereClause = sql``;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (filters?.clauses && filters.clauses.length > 0) {
        const conditions: ReturnType<typeof sql>[] = [];

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        for (let i = 0; i < filters.clauses.length; i++) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
          const clause = filters.clauses[i];
          if (!clause) continue;

          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          const columnRef = sql.raw(`"${clause.column}"`);

          let condition: ReturnType<typeof sql>;

          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          if (clause.operator === "IS NULL") {
            condition = sql`${columnRef} IS NULL`;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          } else if (clause.operator === "IS NOT NULL") {
            condition = sql`${columnRef} IS NOT NULL`;
          } else if (
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            clause.operator === "LIKE" ||
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            clause.operator === "ILIKE"
          ) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
            const value = clause.value;
            const operator =
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              clause.operator === "LIKE" ? sql`LIKE` : sql`ILIKE`;
            condition = sql`${columnRef} ${operator} ${value}`;
          } else {
            // For =, !=, >, <, >=, <=
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
            const operator = sql.raw(clause.operator);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
            const value = clause.value;

            // Try to parse as number if it looks like a number
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            let parsedValue: string | number = value;
            if (
              value !== "" &&
              !isNaN(Number(value)) &&
              // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
              value.trim() !== ""
            ) {
              parsedValue = Number(value);
            }

            condition = sql`${columnRef} ${operator} ${parsedValue}`;
          }

          conditions.push(condition);

          // Add connector if not the last clause
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          if (i < filters.clauses.length - 1) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
            const connector = filters.connectors?.[i] ?? "AND";
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
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
