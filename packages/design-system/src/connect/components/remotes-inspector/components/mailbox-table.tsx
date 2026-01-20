import { Icon } from "@powerhousedao/design-system";
import type {
  SyncOperation,
  SyncOperationStatus,
} from "@powerhousedao/reactor";
import { twMerge } from "tailwind-merge";
import { type ColumnDef, type SortOptions, truncateId } from "../utils.js";
import { SortIcon } from "./sort-icon.js";

export type MailboxType = "inbox" | "outbox" | "deadLetter";

const COLUMNS: ColumnDef[] = [
  { key: "id", label: "ID", width: "120px" },
  { key: "documentId", label: "Document ID", width: "150px" },
  { key: "branch", label: "Branch", width: "100px" },
  { key: "status", label: "Status", width: "150px" },
  { key: "opsCount", label: "Ops Count", width: "80px" },
];

const DEAD_LETTER_COLUMNS: ColumnDef[] = [
  { key: "id", label: "ID", width: "120px" },
  { key: "documentId", label: "Document ID", width: "150px" },
  { key: "branch", label: "Branch", width: "100px" },
  { key: "error", label: "Error", width: "200px" },
];

function getStatusLabel(status: SyncOperationStatus): string {
  switch (status) {
    case -1:
      return "Unknown";
    case 0:
      return "Transport Pending";
    case 1:
      return "Execution Pending";
    case 2:
      return "Applied";
    case 3:
      return "Error";
    default:
      return "Unknown";
  }
}

function getStatusIcon(status: SyncOperationStatus): React.ReactNode {
  switch (status) {
    case 0:
    case 1:
      return <span>⏳</span>;
    case 2:
      return <span>✅</span>;
    case 3:
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
      case "id":
        comparison = a.id.localeCompare(b.id);
        break;
      case "documentId":
        comparison = a.documentId.localeCompare(b.documentId);
        break;
      case "branch":
        comparison = a.branch.localeCompare(b.branch);
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
  const columns = mailboxType === "deadLetter" ? DEAD_LETTER_COLUMNS : COLUMNS;
  const sortedOps = sortOperations(operations, sort);

  const handleSort = (columnKey: string) => {
    onSort(mailboxType, columnKey);
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        className="flex items-center gap-2 text-left text-sm font-medium text-gray-700 hover:text-gray-900"
        onClick={onToggleCollapse}
        type="button"
      >
        <Icon
          className={twMerge("transition-transform", collapsed && "-rotate-90")}
          name="ChevronDown"
          size={14}
        />
        {title} ({operations.length} item{operations.length !== 1 ? "s" : ""})
      </button>

      {!collapsed && (
        <div className="max-h-64 overflow-auto rounded-lg border border-gray-300">
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
                    <td className="px-3 py-2 text-xs text-gray-900">
                      <span className="block truncate" title={op.id}>
                        {truncateId(op.id)}
                      </span>
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
                    {mailboxType === "deadLetter" ? (
                      <td className="border-l border-gray-300 px-3 py-2 text-xs">
                        <span
                          className="block truncate text-red-600"
                          title={getErrorMessage(op.error)}
                        >
                          ❌ {getErrorMessage(op.error) || "Unknown error"}
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
    </div>
  );
}
