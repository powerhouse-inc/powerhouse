import { Icon } from "@powerhousedao/design-system";
import { useState } from "react";
import { twMerge } from "tailwind-merge";

export type ColumnInfo = {
  readonly name: string;
  readonly dataType: string;
  readonly isNullable: boolean;
};

export type SortDirection = "asc" | "desc";

export type SortOptions = {
  readonly column: string;
  readonly direction: SortDirection;
};

export type PaginationState = {
  readonly offset: number;
  readonly limit: number;
  readonly total: number | null;
};

export type TableViewProps = {
  readonly columns: ColumnInfo[];
  readonly rows: Record<string, unknown>[];
  readonly pagination: PaginationState;
  readonly onPageChange: (offset: number) => void;
  readonly onSort?: (sort: SortOptions) => void;
  readonly currentSort?: SortOptions;
  readonly loading?: boolean;
};

function formatCellValue(value: unknown): string {
  if (value === null) return "NULL";
  if (value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "function") return "[function]";
  if (typeof value === "symbol") return value.toString();
  return String(value as string | number | boolean | bigint);
}

function escapeCsvValue(value: string): string {
  // If the value contains comma, newline, or double quote, wrap it in quotes and escape quotes
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function rowToCsv(
  row: Record<string, unknown>,
  columns: ColumnInfo[],
): string {
  return columns
    .map((column) => {
      const value = formatCellValue(row[column.name]);
      return escapeCsvValue(value);
    })
    .join(",");
}

function rowsToCsv(
  rows: Record<string, unknown>[],
  columns: ColumnInfo[],
): string {
  const header = columns.map((col) => escapeCsvValue(col.name)).join(",");
  const dataRows = rows.map((row) => rowToCsv(row, columns));
  return [header, ...dataRows].join("\n");
}

async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

function SortIcon({
  direction,
  active,
}: {
  readonly direction: SortDirection;
  readonly active: boolean;
}) {
  if (!active) {
    return (
      <Icon
        className="opacity-0 group-hover:opacity-50"
        name="CaretSort"
        size={12}
      />
    );
  }

  return (
    <Icon
      className={direction === "asc" ? "rotate-180" : undefined}
      name="TriangleDown"
      size={12}
    />
  );
}

export function TableView({
  columns,
  rows,
  pagination,
  onPageChange,
  onSort,
  currentSort,
  loading = false,
}: TableViewProps) {
  const { offset, limit, total } = pagination;

  const currentPage = Math.floor(offset / limit);
  const totalPages = total !== null ? Math.ceil(total / limit) : 0;
  const startItem = total === 0 ? 0 : offset + 1;
  const endItem =
    total !== null ? Math.min(offset + limit, total) : offset + rows.length;

  const goToPage = (page: number) => {
    onPageChange(page * limit);
  };

  const handleSort = (columnName: string) => {
    if (!onSort) return;

    const newDirection: SortDirection =
      currentSort?.column === columnName && currentSort.direction === "asc"
        ? "desc"
        : "asc";

    onSort({ column: columnName, direction: newDirection });
  };

  const getVisiblePages = (): number[] => {
    const maxVisible = 3;

    if (totalPages <= maxVisible) {
      return Array.from({ length: totalPages }, (_, i) => i);
    }

    const start = Math.max(
      0,
      Math.min(currentPage - 1, totalPages - maxVisible),
    );
    const end = Math.min(totalPages - 1, start + maxVisible - 1);

    const pages: number[] = [];
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    return pages;
  };

  const visiblePages = getVisiblePages();
  const [copying, setCopying] = useState(false);
  const [copiedRowIndex, setCopiedRowIndex] = useState<number | null>(null);

  const handleCopyAll = async () => {
    if (rows.length === 0) return;
    setCopying(true);
    try {
      const csv = rowsToCsv(rows, columns);
      await copyToClipboard(csv);
      setTimeout(() => setCopying(false), 1000);
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
      setCopying(false);
    }
  };

  const handleCopyRow = async (rowIndex: number) => {
    if (rowIndex < 0 || rowIndex >= rows.length) return;
    setCopiedRowIndex(rowIndex);
    try {
      const csv = rowToCsv(rows[rowIndex], columns);
      await copyToClipboard(csv);
      setTimeout(() => setCopiedRowIndex(null), 1000);
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
      setCopiedRowIndex(null);
    }
  };

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex shrink-0 items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="text-gray-600">
            {loading
              ? "Loading..."
              : total !== null
                ? `Showing ${startItem.toLocaleString()}-${endItem.toLocaleString()} of ${total.toLocaleString()}`
                : `Showing ${rows.length.toLocaleString()} rows`}
          </span>
          {rows.length > 0 && (
            <button
              className="flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={loading || copying}
              onClick={handleCopyAll}
              title="Copy all rows as CSV"
              type="button"
            >
              <Icon name={copying ? "Check" : "Copy"} size={14} />
              {copying ? "Copied!" : "Copy All"}
            </button>
          )}
        </div>

        {total !== null && total > limit && (
          <div className="flex gap-1">
            <button
              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={currentPage === 0}
              onClick={() => goToPage(0)}
              type="button"
            >
              First
            </button>
            <button
              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={currentPage === 0}
              onClick={() => goToPage(currentPage - 1)}
              type="button"
            >
              <Icon className="rotate-90" name="ChevronDown" size={14} />
            </button>

            {visiblePages[0] > 0 && (
              <span className="flex items-center px-1 text-xs text-gray-500">
                ...
              </span>
            )}

            {visiblePages.map((page) => (
              <button
                key={page}
                className={twMerge(
                  "min-w-8 rounded border px-2 py-1 text-xs",
                  page === currentPage
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100",
                )}
                onClick={() => goToPage(page)}
                type="button"
              >
                {page + 1}
              </button>
            ))}

            {visiblePages[visiblePages.length - 1] < totalPages - 1 && (
              <span className="flex items-center px-1 text-xs text-gray-500">
                ...
              </span>
            )}

            <button
              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={currentPage >= totalPages - 1}
              onClick={() => goToPage(currentPage + 1)}
              type="button"
            >
              <Icon className="-rotate-90" name="ChevronDown" size={14} />
            </button>
            <button
              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={currentPage >= totalPages - 1}
              onClick={() => goToPage(totalPages - 1)}
              type="button"
            >
              Last
            </button>
          </div>
        )}
      </div>

      <div
        className={twMerge(
          "max-h-full overflow-auto rounded-lg border border-gray-300 transition-opacity",
          loading && "pointer-events-none opacity-50",
        )}
      >
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-gray-100">
            <tr>
              <th className="w-12 px-2 py-2 text-center text-xs font-medium text-gray-600">
                <span className="sr-only">Copy</span>
              </th>
              {columns.map((column, index) => {
                const isActive = currentSort?.column === column.name;
                const sortDirection = isActive ? currentSort.direction : "asc";

                return (
                  <th
                    key={column.name}
                    className={twMerge(
                      "group px-3 py-2 text-left text-xs font-medium text-gray-600",
                      index > 0 && "border-l border-gray-300",
                      onSort &&
                        "cursor-pointer hover:bg-gray-200 hover:text-gray-900",
                    )}
                    onClick={() => onSort && handleSort(column.name)}
                  >
                    <div className="flex items-center gap-1">
                      <span className="truncate">{column.name}</span>
                      {onSort && (
                        <SortIcon active={isActive} direction={sortDirection} />
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  className="px-3 py-8 text-center text-sm text-gray-500"
                  colSpan={columns.length + 1}
                >
                  No data
                </td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className="odd:bg-white even:bg-gray-50 hover:bg-blue-50"
                >
                  <td className="px-2 py-2 text-center">
                    <button
                      className="flex items-center justify-center rounded p-1 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                      onClick={() => void handleCopyRow(rowIndex)}
                      title="Copy row as CSV"
                      type="button"
                    >
                      <Icon
                        name={copiedRowIndex === rowIndex ? "Check" : "Copy"}
                        size={14}
                      />
                    </button>
                  </td>
                  {columns.map((column, colIndex) => (
                    <td
                      key={column.name}
                      className={twMerge(
                        "px-3 py-2 text-xs text-gray-900",
                        colIndex > 0 && "border-l border-gray-300",
                      )}
                    >
                      <span
                        className={twMerge(
                          "block truncate",
                          row[column.name] === null && "italic text-gray-400",
                        )}
                        title={formatCellValue(row[column.name])}
                      >
                        {formatCellValue(row[column.name])}
                      </span>
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
