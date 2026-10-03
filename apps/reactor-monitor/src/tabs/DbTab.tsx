/**
 * A simple schema-tree + table viewer over `IReactorDbQuery.queryDb` (raw
 * SQL, information_schema reads plus a bounded `select *`). Deliberately not
 * a port of Connect's `useDbExplorer` — that hook is entangled with
 * Connect's pg-dump/export machinery, which this lab-bench app has no use
 * for and should not pull in.
 */
import type { IReactorDbQuery } from "@powerhousedao/reactor";
import { useCallback, useEffect, useState } from "react";

export type DbTabProps = {
  readonly dbQuery: IReactorDbQuery;
};

type TableRef = { schema: string; name: string };

/** Only identifiers that came back from information_schema are ever quoted
 * into SQL (table names cannot be parameterized); this is a defensive check
 * against a store that somehow named something unusual, not user input. */
const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function quoteIdentifier(identifier: string): string {
  if (!SAFE_IDENTIFIER.test(identifier)) {
    throw new Error(`Refusing to quote unsafe identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

const ROW_LIMIT = 50;

export function DbTab({ dbQuery }: DbTabProps) {
  const [tables, setTables] = useState<TableRef[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TableRef | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [rowError, setRowError] = useState<string | null>(null);
  const [loadingRows, setLoadingRows] = useState(false);

  const loadTables = useCallback(async () => {
    try {
      const result = await dbQuery.queryDb(
        `select table_schema, table_name
         from information_schema.tables
         where table_schema not in ('pg_catalog', 'information_schema')
         order by table_schema, table_name`,
      );
      setTables(
        (result as { table_schema: string; table_name: string }[]).map((r) => ({
          schema: r.table_schema,
          name: r.table_name,
        })),
      );
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [dbQuery]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks-extra/set-state-in-effect
    void loadTables();
  }, [loadTables]);

  const selectTable = useCallback(
    async (table: TableRef) => {
      setSelected(table);
      setLoadingRows(true);
      setRowError(null);
      try {
        const qualified = `${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)}`;
        const result = (await dbQuery.queryDb(
          `select * from ${qualified} limit ${ROW_LIMIT}`,
        )) as Record<string, unknown>[];
        setRows(result);
        setColumns(result.length > 0 ? Object.keys(result[0]!) : []);
      } catch (e) {
        setRowError(e instanceof Error ? e.message : String(e));
        setRows([]);
        setColumns([]);
      } finally {
        setLoadingRows(false);
      }
    },
    [dbQuery],
  );

  return (
    <div className="rm-tab rm-db-tab">
      <h2>DB</h2>
      {loadError ? (
        <p className="rm-error">Failed to load schema: {loadError}</p>
      ) : null}
      <div className="rm-db-layout">
        <aside className="rm-db-tree" aria-label="Schema tree">
          {tables.length === 0 ? (
            <p className="rm-placeholder">No tables</p>
          ) : (
            <ul>
              {tables.map((table) => (
                <li key={`${table.schema}.${table.name}`}>
                  <button
                    className={
                      selected?.schema === table.schema &&
                      selected.name === table.name
                        ? "rm-tree-item rm-tree-item-active"
                        : "rm-tree-item"
                    }
                    onClick={() => void selectTable(table)}
                    type="button"
                  >
                    {table.schema}.{table.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <div className="rm-db-view">
          {!selected ? (
            <p className="rm-placeholder">Select a table to preview its rows</p>
          ) : (
            <>
              <h3>
                {selected.schema}.{selected.name}
              </h3>
              {rowError ? <p className="rm-error">{rowError}</p> : null}
              {loadingRows ? (
                <p className="rm-placeholder">Loading...</p>
              ) : null}
              {!loadingRows && !rowError ? (
                <div className="rm-table-wrap">
                  <table className="rm-table">
                    <thead>
                      <tr>
                        {columns.map((column) => (
                          <th key={column}>{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 ? (
                        <tr>
                          <td
                            className="rm-table-empty"
                            colSpan={Math.max(columns.length, 1)}
                          >
                            (empty)
                          </td>
                        </tr>
                      ) : (
                        rows.map((row, index) => (
                          <tr key={index}>
                            {columns.map((column) => (
                              <td key={column}>{formatCell(row[column])}</td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : null}
              <p className="rm-note">Showing up to {ROW_LIMIT} row(s)</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return value;
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return value.toString();
  }
  return JSON.stringify(value);
}

export default DbTab;
