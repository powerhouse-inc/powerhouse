import { Icon } from "@powerhousedao/design-system";
import type { Remote } from "@powerhousedao/reactor";
import { useCallback, useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";
import { ChannelInspector } from "./components/channel-inspector.js";
import { SortIcon } from "./components/sort-icon.js";
import {
  type ColumnDef,
  type SortDirection,
  type SortOptions,
  truncateId,
} from "./utils.js";

export type RemotesInspectorProps = {
  readonly getRemotes: () => Promise<Remote[]>;
};

const COLUMNS: ColumnDef[] = [
  { key: "id", label: "ID", width: "120px" },
  { key: "name", label: "Name", width: "150px" },
  { key: "collectionId", label: "Collection ID", width: "200px" },
  { key: "filter", label: "Filter", width: "200px" },
  { key: "channel", label: "Channel", width: "100px" },
];

function formatFilter(filter: Remote["filter"]): string {
  const parts: string[] = [];

  if (filter.branch) {
    parts.push(`branch:${filter.branch}`);
  }

  if (filter.documentId.length > 0) {
    parts.push(`${filter.documentId.length} doc(s)`);
  }

  if (filter.scope.length > 0) {
    parts.push(`${filter.scope.length} scope(s)`);
  }

  return parts.length > 0 ? parts.join(", ") : "-";
}

function sortRemotes(
  remotes: Remote[],
  sort: SortOptions | undefined,
): Remote[] {
  if (!sort) return remotes;

  return [...remotes].sort((a, b) => {
    let aValue: string;
    let bValue: string;

    switch (sort.column) {
      case "id":
        aValue = a.id;
        bValue = b.id;
        break;
      case "name":
        aValue = a.name;
        bValue = b.name;
        break;
      case "collectionId":
        aValue = a.collectionId;
        bValue = b.collectionId;
        break;
      case "filter":
        aValue = formatFilter(a.filter);
        bValue = formatFilter(b.filter);
        break;
      default:
        return 0;
    }

    const comparison = aValue.localeCompare(bValue);
    return sort.direction === "asc" ? comparison : -comparison;
  });
}

export function RemotesInspector({ getRemotes }: RemotesInspectorProps) {
  const [remotes, setRemotes] = useState<Remote[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortOptions | undefined>();
  const [selectedRemote, setSelectedRemote] = useState<Remote | undefined>();

  const loadRemotes = useCallback(async () => {
    setLoading(true);
    const data = await getRemotes();
    setRemotes(data);
    setLoading(false);
  }, [getRemotes]);

  useEffect(() => {
    void loadRemotes();
  }, [loadRemotes]);

  const handleRefresh = useCallback(async () => {
    await loadRemotes();
    if (selectedRemote) {
      const updated = remotes.find((r) => r.id === selectedRemote.id);
      setSelectedRemote(updated);
    }
  }, [loadRemotes, selectedRemote, remotes]);

  const handleSort = (columnKey: string) => {
    if (columnKey === "channel") return;

    const newDirection: SortDirection =
      sort?.column === columnKey && sort.direction === "asc" ? "desc" : "asc";

    setSort({ column: columnKey, direction: newDirection });
  };

  const handleViewChannel = (remote: Remote) => {
    setSelectedRemote(remote);
  };

  const handleBack = () => {
    setSelectedRemote(undefined);
  };

  if (selectedRemote) {
    return (
      <ChannelInspector
        channel={selectedRemote.channel}
        onBack={handleBack}
        onRefresh={() => void handleRefresh()}
        remoteName={selectedRemote.name}
      />
    );
  }

  const sortedRemotes = sortRemotes(remotes, sort);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex shrink-0 items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          Remotes Inspector
        </h2>
        <button
          className="flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          disabled={loading}
          onClick={() => void handleRefresh()}
          type="button"
        >
          <Icon name="Reload" size={14} />
          Refresh
        </button>
      </div>

      <div className="max-h-full overflow-auto rounded-lg border border-gray-300">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-gray-100">
            <tr>
              {COLUMNS.map((column, index) => {
                const isActive = sort?.column === column.key;
                const sortDirection = isActive ? sort.direction : "asc";
                const isSortable = column.key !== "channel";

                return (
                  <th
                    key={column.key}
                    className={twMerge(
                      "group px-3 py-2 text-left text-xs font-medium text-gray-600",
                      index > 0 && "border-l border-gray-300",
                      isSortable &&
                        "cursor-pointer hover:bg-gray-200 hover:text-gray-900",
                    )}
                    onClick={() => isSortable && handleSort(column.key)}
                    style={{ width: column.width }}
                  >
                    <div className="flex items-center gap-1">
                      <span className="truncate">{column.label}</span>
                      {isSortable && (
                        <SortIcon active={isActive} direction={sortDirection} />
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading && sortedRemotes.length === 0 ? (
              <tr>
                <td
                  className="px-3 py-8 text-center text-sm text-gray-500"
                  colSpan={COLUMNS.length}
                >
                  Loading...
                </td>
              </tr>
            ) : sortedRemotes.length === 0 ? (
              <tr>
                <td
                  className="px-3 py-8 text-center text-sm text-gray-500"
                  colSpan={COLUMNS.length}
                >
                  No remotes configured
                </td>
              </tr>
            ) : (
              sortedRemotes.map((remote) => (
                <tr
                  key={remote.id}
                  className="odd:bg-white even:bg-gray-50 hover:bg-blue-50"
                >
                  <td className="px-3 py-2 text-xs text-gray-900">
                    <span className="block truncate" title={remote.id}>
                      {truncateId(remote.id)}
                    </span>
                  </td>
                  <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">
                    <span className="block truncate" title={remote.name}>
                      {remote.name}
                    </span>
                  </td>
                  <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">
                    <span
                      className="block truncate"
                      title={remote.collectionId}
                    >
                      {remote.collectionId}
                    </span>
                  </td>
                  <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">
                    <span
                      className="block truncate"
                      title={formatFilter(remote.filter)}
                    >
                      {formatFilter(remote.filter)}
                    </span>
                  </td>
                  <td className="border-l border-gray-300 px-3 py-2">
                    <button
                      className="flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100"
                      onClick={() => handleViewChannel(remote)}
                      type="button"
                    >
                      View
                      <Icon name="CaretRight" size={12} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="shrink-0 text-sm text-gray-600">
        Showing {sortedRemotes.length} remote(s)
      </div>
    </div>
  );
}
