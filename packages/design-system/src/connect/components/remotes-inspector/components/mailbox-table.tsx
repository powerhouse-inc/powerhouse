import { Icon } from "@powerhousedao/design-system";
import {
  type SyncOperation,
  SyncOperationStatus,
} from "@powerhousedao/reactor";
import { useState } from "react";
import { twMerge } from "tailwind-merge";
import { ObjectInspectorModal } from "../../object-inspector-modal/index.js";
import { type ColumnDef, type SortOptions, truncateId } from "../utils.js";
import { SortIcon } from "./sort-icon.js";

export type MailboxType = "inbox" | "outbox" | "deadLetter";

const VIEW_COLUMN: ColumnDef = { key: "view", label: "", width: "60px" };

const COLUMNS: ColumnDef[] = [
  VIEW_COLUMN,
  { key: "documentId", label: "Document ID", width: "150px" },
  { key: "branch", label: "Branch", width: "100px" },
  { key: "scopes", label: "Scopes", width: "100px" },
  { key: "status", label: "Status", width: "150px" },
  { key: "opsCount", label: "Ops Count", width: "80px" },
];

const DEAD_LETTER_COLUMNS: ColumnDef[] = [
  VIEW_COLUMN,
  { key: "documentId", label: "Document ID", width: "150px" },
  { key: "branch", label: "Branch", width: "100px" },
  { key: "scopes", label: "Scopes", width: "100px" },
  { key: "error", label: "Error", width: "200px" },
];

function toSerializableObject(obj: unknown): unknown {
  return JSON.parse(
    JSON.stringify(obj, (_key, value: unknown) => {
      if (typeof value === "function") return "[Function]";
      if (typeof value === "symbol") return "[Symbol]";
      if (value instanceof Error)
        return { name: value.name, message: value.message };
      return value;
    }),
  );
}

function getStatusLabel(status: SyncOperationStatus): string {
  switch (status) {
    case SyncOperationStatus.Unknown:
      return "Unknown";
    case SyncOperationStatus.TransportPending:
      return "Transport Pending";
    case SyncOperationStatus.ExecutionPending:
      return "Execution Pending";
    case SyncOperationStatus.Applied:
      return "Applied";
    case SyncOperationStatus.Error:
      return "Error";
    default:
      return "Unknown";
  }
}

function getStatusIcon(status: SyncOperationStatus): React.ReactNode {
  switch (status) {
    case SyncOperationStatus.TransportPending:
    case SyncOperationStatus.ExecutionPending:
      return <span>⏳</span>;
    case SyncOperationStatus.Applied:
      return <span>✅</span>;
    case SyncOperationStatus.Error:
      return <span>❌</span>;
    default:
      return <span>❓</span>;
  }
}

function getErrorMessage(error: SyncOperation["error"]): string {
  if (!error) return "";
  return error.error.message;
}

function sortOperations(
  operations: readonly SyncOperation[],
  sort: SortOptions | undefined,
): SyncOperation[] {
  const ops = [...operations];
  if (!sort) return ops;

  return ops.sort((a, b) => {
    let comparison = 0;

    switch (sort.column) {
      case "documentId":
        comparison = a.documentId.localeCompare(b.documentId);
        break;
      case "branch":
        comparison = a.branch.localeCompare(b.branch);
        break;
      case "scopes":
        comparison = a.scopes.join(",").localeCompare(b.scopes.join(","));
        break;
      case "status":
        comparison = a.status - b.status;
        break;
      case "opsCount":
        comparison = a.operations.length - b.operations.length;
        break;
      case "error":
        comparison = getErrorMessage(a.error).localeCompare(
          getErrorMessage(b.error),
        );
        break;
      default:
        return 0;
    }

    return sort.direction === "asc" ? comparison : -comparison;
  });
}

export type MailboxTableProps = {
  readonly title: string;
  readonly mailboxType: MailboxType;
  readonly operations: readonly SyncOperation[];
  readonly sort: SortOptions | undefined;
  readonly onSort: (mailbox: MailboxType, column: string) => void;
  readonly collapsed: boolean;
  readonly onToggleCollapse: () => void;
};

export function MailboxTable({
  title,
  mailboxType,
  operations,
  sort,
  onSort,
  collapsed,
  onToggleCollapse,
}: MailboxTableProps) {
  const [selectedOperation, setSelectedOperation] =
    useState<SyncOperation | null>(null);
  const columns = mailboxType === "deadLetter" ? DEAD_LETTER_COLUMNS : COLUMNS;
  const sortedOps = sortOperations(operations, sort);

  const handleSort = (columnKey: string) => {
    onSort(mailboxType, columnKey);
  };

  const handleCopyAll = async () => {
    const serializable = toSerializableObject(operations);
    const json = JSON.stringify(serializable, null, 2);
    await navigator.clipboard.writeText(json);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <button
          className="flex items-center gap-2 text-left text-sm font-medium text-gray-700 hover:text-gray-900"
          onClick={onToggleCollapse}
          type="button"
        >
          <Icon
            className={twMerge(
              "transition-transform",
              collapsed && "-rotate-90",
            )}
            name="ChevronDown"
            size={14}
          />
          {title} ({operations.length} item{operations.length !== 1 ? "s" : ""})
        </button>
        {operations.length > 0 && (
          <button
            className="flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200"
            onClick={() => void handleCopyAll()}
            type="button"
          >
            <Icon name="Copy" size={12} />
            Copy All
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="overflow-hidden rounded-lg border border-gray-300">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-gray-100">
              <tr>
                {columns.map((column, index) => {
                  const isActive = sort?.column === column.key;
                  const sortDirection = isActive ? sort.direction : "asc";

                  return (
                    <th
                      key={column.key}
                      className={twMerge(
                        "group cursor-pointer px-3 py-2 text-left text-xs font-medium text-gray-600 hover:bg-gray-200 hover:text-gray-900",
                        index > 0 && "border-l border-gray-300",
                      )}
                      onClick={() => handleSort(column.key)}
                      style={{ width: column.width }}
                    >
                      <div className="flex items-center gap-1">
                        <span className="truncate">{column.label}</span>
                        <SortIcon active={isActive} direction={sortDirection} />
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedOps.length === 0 ? (
                <tr>
                  <td
                    className="px-3 py-4 text-center text-sm text-gray-500"
                    colSpan={columns.length}
                  >
                    No operations
                  </td>
                </tr>
              ) : (
                sortedOps.map((op) => (
                  <tr
                    key={op.id}
                    className="odd:bg-white even:bg-gray-50 hover:bg-blue-50"
                  >
                    <td className="px-3 py-2 text-xs">
                      <button
                        className="flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100"
                        onClick={() => setSelectedOperation(op)}
                        type="button"
                      >
                        View
                      </button>
                    </td>
                    <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">
                      <span className="block truncate" title={op.documentId}>
                        {truncateId(op.documentId)}
                      </span>
                    </td>
                    <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">
                      <span className="block truncate" title={op.branch}>
                        {op.branch}
                      </span>
                    </td>
                    <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">
                      <span
                        className="block truncate"
                        title={op.scopes.join(", ")}
                      >
                        {op.scopes.join(", ")}
                      </span>
                    </td>
                    {mailboxType === "deadLetter" ? (
                      <td className="border-l border-gray-300 px-3 py-2 text-xs">
                        <span
                          className="block truncate text-red-600"
                          title={getErrorMessage(op.error)}
                        >
                          {getErrorMessage(op.error) || "Unknown error"}
                        </span>
                      </td>
                    ) : (
                      <>
                        <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">
                          <span className="flex items-center gap-1">
                            {getStatusIcon(op.status)}
                            {getStatusLabel(op.status)}
                          </span>
                        </td>
                        <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">
                          {op.operations.length}
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <ObjectInspectorModal
        object={selectedOperation}
        onOpenChange={(open) => !open && setSelectedOperation(null)}
        open={selectedOperation !== null}
        title="Sync Operation"
      />
    </div>
  );
}
