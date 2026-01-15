import { useCallback, useEffect, useRef, useState } from "react";
import { ConnectConfirmationModal } from "../modal/confirmation-modal.js";
import {
  SchemaTreeSidebar,
  type TableInfo,
} from "./components/schema-tree-sidebar.js";
import {
  TableView,
  rowsToCsv,
  type ColumnInfo,
  type FilterGroup,
  type FilterClause,
  type PaginationState,
  type SortOptions,
} from "./components/table-view.js";

// Re-export types
export type { TableInfo } from "./components/schema-tree-sidebar.js";
export type {
  ColumnInfo,
  SortOptions,
  FilterGroup,
  FilterClause,
} from "./components/table-view.js";

export type GetTableRowsOptions = {
  readonly schema?: string;
  readonly limit: number;
  readonly offset: number;
  readonly sort?: SortOptions;
  readonly filters?: FilterGroup;
};

export type TablePage = {
  readonly columns: string[];
  readonly rows: Record<string, unknown>[];
  readonly total: number | null;
};
export interface DbClient {
  readonly kind: string;
  listTables(schema?: string): Promise<string[]>;
  getTableSchema(table: string, schema?: string): Promise<ColumnInfo[]>;
  getTableRows(table: string, options: GetTableRowsOptions): Promise<TablePage>;
}

/** Props for the main DBExplorer component */
export type DBExplorerProps = {
  readonly schema: string;
  readonly getTables: () => Promise<TableInfo[]>;
  readonly getTableRows: (
    table: string,
    options: GetTableRowsOptions,
  ) => Promise<TablePage>;
  readonly getDefaultSort?: (table: string) => SortOptions | undefined;
  readonly pageSize?: number;
  readonly onImportDb?: (sqlContent: string) => void | Promise<void>;
  readonly onExportDb?: () => void | Promise<void>;
};

const DEFAULT_PAGE_SIZE = 50;

export function DBExplorer({
  schema,
  getTables,
  getTableRows,
  getDefaultSort,
  pageSize = DEFAULT_PAGE_SIZE,
  onImportDb,
  onExportDb,
}: DBExplorerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<string | undefined>();
  const [tableData, setTableData] = useState<TablePage | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({
    offset: 0,
    limit: pageSize,
    total: null,
  });
  const [sort, setSort] = useState<SortOptions | undefined>();
  const [filters, setFilters] = useState<FilterGroup | undefined>();
  const [loading, setLoading] = useState(false);
  const [pendingImport, setPendingImport] = useState<string | null>(null);

  const columns = tables.find((t) => t.name === selectedTable)?.columns ?? [];

  const loadTableData = useCallback(async () => {
    if (!selectedTable) return;

    setLoading(true);
    const data = await getTableRows(selectedTable, {
      schema,
      limit: pagination.limit,
      offset: pagination.offset,
      sort,
      filters,
    });
    setTableData(data);
    setPagination((prev) => ({ ...prev, total: data.total }));
    setLoading(false);
  }, [
    selectedTable,
    schema,
    pagination.limit,
    pagination.offset,
    sort,
    filters,
    getTableRows,
  ]);

  const handleCopyAll = useCallback(async (): Promise<string> => {
    if (!selectedTable) return "";

    // Fetch all rows by using total as limit (or a large number if unknown)
    const limit = pagination.total ?? 1000000;
    const data = await getTableRows(selectedTable, {
      schema,
      limit,
      offset: 0,
      sort,
      filters,
    });

    return rowsToCsv(data.rows, columns);
  }, [
    selectedTable,
    schema,
    pagination.total,
    sort,
    filters,
    getTableRows,
    columns,
  ]);

  const loadTables = useCallback(async () => {
    setTablesLoading(true);
    const data = await getTables();
    setTables(data);
    setTablesLoading(false);
    return data;
  }, [getTables]);

  const handleRefresh = useCallback(async () => {
    const newTables = await loadTables();

    // Clear selection if selected table no longer exists
    if (selectedTable && !newTables.some((t) => t.name === selectedTable)) {
      setSelectedTable(undefined);
      setTableData(null);
      return;
    }

    // Reload current table data if a table is selected
    if (selectedTable) {
      await loadTableData();
    }
  }, [loadTables, selectedTable, loadTableData]);

  // Load tables on mount
  useEffect(() => {
    void loadTables();
  }, [loadTables]);

  useEffect(() => {
    if (selectedTable) {
      void loadTableData();
    }
  }, [selectedTable, pagination.offset, sort, filters, loadTableData]);

  const handleSelectTable = (table: string) => {
    if (table === selectedTable) return;

    setSelectedTable(table);
    setPagination((prev) => ({ ...prev, offset: 0, total: null }));
    setSort(getDefaultSort?.(table));
    setFilters(undefined);
    setTableData(null);
  };

  const handlePageChange = (offset: number) => {
    setPagination((prev) => ({ ...prev, offset }));
  };

  const handleSort = (newSort: SortOptions) => {
    setSort(newSort);
    setPagination((prev) => ({ ...prev, offset: 0 }));
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    void file.text().then((content) => {
      setPendingImport(content);
    });

    e.target.value = "";
  };

  const handleImportConfirm = async () => {
    if (pendingImport) {
      // Clear selection before import to prevent stale queries
      setSelectedTable(undefined);
      setTableData(null);

      await onImportDb?.(pendingImport);
      setPendingImport(null);
      await loadTables();
    }
  };

  const handleImportCancel = () => {
    setPendingImport(null);
  };

  const handleExportClick = () => {
    void onExportDb?.();
  };

  return (
    <div className="flex h-full">
      <input
        ref={fileInputRef}
        type="file"
        accept=".sql,.txt,text/plain"
        className="hidden"
        onChange={handleFileChange}
      />

      <ConnectConfirmationModal
        open={!!pendingImport}
        onOpenChange={(open) => !open && setPendingImport(null)}
        header="Replace Database?"
        body="This will delete all existing data and replace it with the imported file. This action cannot be undone."
        cancelLabel="Cancel"
        continueLabel="Replace Data"
        onCancel={handleImportCancel}
        onContinue={() => void handleImportConfirm()}
        continueButtonProps={{
          className: "bg-red-900 text-white hover:bg-red-800",
        }}
      />

      <div className="flex w-64 shrink-0 flex-col border-r border-gray-200">
        <div className="flex-1 overflow-auto">
          <SchemaTreeSidebar
            schema={schema}
            tables={tables}
            selectedTable={selectedTable}
            onSelectTable={handleSelectTable}
            onRefresh={handleRefresh}
            loading={tablesLoading || loading}
          />
        </div>

        {(onImportDb || onExportDb) && (
          <div className="flex shrink-0 flex-col gap-2 border-t border-gray-200 p-2">
            {onImportDb && (
              <button
                className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                onClick={handleImportClick}
                type="button"
              >
                Import DB
              </button>
            )}
            {onExportDb && (
              <button
                className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                onClick={handleExportClick}
                type="button"
              >
                Export DB
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {!selectedTable ? (
          <div className="text-sm text-gray-500">
            Select a table to view data
          </div>
        ) : !tableData && loading ? (
          <div className="text-sm text-gray-500">Loading...</div>
        ) : tableData ? (
          <TableView
            columns={columns}
            rows={tableData.rows}
            pagination={pagination}
            onPageChange={handlePageChange}
            onSort={handleSort}
            currentSort={sort}
            loading={loading}
            filters={filters}
            onFiltersChange={(newFilters) => {
              setFilters(newFilters);
              setPagination((prev) => ({ ...prev, offset: 0 }));
            }}
            onCopyAll={handleCopyAll}
          />
        ) : null}
      </div>
    </div>
  );
}
