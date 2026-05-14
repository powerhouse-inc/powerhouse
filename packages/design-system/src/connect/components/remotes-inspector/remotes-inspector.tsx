import { Icon } from "#design-system";
import type { Remote } from "@powerhousedao/reactor-browser";
import { useCallback, useEffect, useMemo, useState } from "react";
import { twMerge } from "tailwind-merge";
import { ChannelInspector } from "./components/channel-inspector.js";
import { ConnectionStateBadge } from "./components/connection-state-badge.js";
import { SortIcon } from "./components/sort-icon.js";
import {
  type ColumnDef,
  type SortDirection,
  type SortOptions,
  truncateId,
} from "./utils.js";

export type ConnectionStateSummary = {
  state: string;
  failureCount: number;
  lastSuccessUtcMs: number;
  lastFailureUtcMs: number;
  pushBlocked: boolean;
  pushFailureCount: number;
};

export type RemotesInspectorProps = {
  readonly getRemotes: () => Promise<Remote[]>;
  readonly removeRemote?: (name: string) => Promise<void>;
  readonly addRemoteManual?: (url: string) => Promise<void>;
  readonly triggerPull?: (name: string) => void;
  readonly connectionStates?: ReadonlyMap<string, ConnectionStateSummary>;
};

const BASE_COLUMNS: ColumnDef[] = [
  { key: "id", label: "ID", width: "120px" },
  { key: "name", label: "Name", width: "150px" },
  { key: "status", label: "Status", width: "120px" },
  { key: "collectionId", label: "Collection ID", width: "200px" },
  { key: "filter", label: "Filter", width: "200px" },
  { key: "channel", label: "Channel", width: "100px" },
];

const ACTIONS_COLUMN: ColumnDef = {
  key: "actions",
  label: "Actions",
  width: "100px",
};

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

export function RemotesInspector({
  getRemotes,
  removeRemote,
  addRemoteManual,
  triggerPull,
  connectionStates,
}: RemotesInspectorProps) {
  const [remotes, setRemotes] = useState<Remote[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortOptions | undefined>();
  const [selectedRemote, setSelectedRemote] = useState<Remote | undefined>();
  const [manualUrl, setManualUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | undefined>();

  const hasRowActions = !!removeRemote || !!triggerPull;
  const columns = useMemo(
    () => (hasRowActions ? [...BASE_COLUMNS, ACTIONS_COLUMN] : BASE_COLUMNS),
    [hasRowActions],
  );

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
    if (
      columnKey === "channel" ||
      columnKey === "actions" ||
      columnKey === "status"
    )
      return;

    const newDirection: SortDirection =
      sort?.column === columnKey && sort.direction === "asc" ? "desc" : "asc";

    setSort({ column: columnKey, direction: newDirection });
  };

  const handleViewChannel = (remote: Remote) => {
    setSelectedRemote(remote);
  };

  const handleRemove = useCallback(
    async (remote: Remote) => {
      if (!removeRemote) return;
      await removeRemote(remote.name);
      await loadRemotes();
      if (selectedRemote?.id === remote.id) {
        setSelectedRemote(undefined);
      }
    },
    [removeRemote, loadRemotes, selectedRemote],
  );

  const handleBack = () => {
    setSelectedRemote(undefined);
  };

  const handleAddManual = useCallback(async () => {
    if (!addRemoteManual) return;
    const url = manualUrl.trim();
    if (!url) return;
    setAdding(true);
    setAddError(undefined);
    try {
      await addRemoteManual(url);
      setManualUrl("");
      await loadRemotes();
    } catch (error) {
      setAddError(error instanceof Error ? error.message : String(error));
    } finally {
      setAdding(false);
    }
  }, [addRemoteManual, manualUrl, loadRemotes]);

  const handlePull = useCallback(
    (remote: Remote) => {
      triggerPull?.(remote.name);
    },
    [triggerPull],
  );

  if (selectedRemote) {
    return (
      <ChannelInspector
        channel={selectedRemote.channel}
        connectionState={connectionStates?.get(selectedRemote.name)}
        onBack={handleBack}
        onRefresh={() => void handleRefresh()}
        remoteName={selectedRemote.name}
      />
    );
  }

  const sortedRemotes = sortRemotes(remotes, sort);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900">
          Remotes Inspector
        </h2>
        <div className="flex items-center gap-2">
          {addRemoteManual && (
            <div className="flex items-center gap-1">
              <input
                className="w-[260px] rounded-sm border border-gray-300 px-2 py-1.5 text-sm text-gray-900 placeholder:text-gray-400"
                disabled={adding}
                onChange={(e) => setManualUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAddManual();
                }}
                placeholder="https://reactor/d/drive-id"
                type="text"
                value={manualUrl}
              />
              <button
                className="flex items-center gap-1 rounded-sm border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                disabled={adding || !manualUrl.trim()}
                onClick={() => void handleAddManual()}
                title="Register a remote drive in manual poll mode (no background polling)"
                type="button"
              >
                Add (manual)
              </button>
            </div>
          )}
          <button
            className="flex items-center gap-1 rounded-sm border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            disabled={loading}
            onClick={() => void handleRefresh()}
            type="button"
          >
            <Icon name="Reload" size={14} />
            Refresh
          </button>
        </div>
      </div>
      {addError && (
        <div className="shrink-0 rounded-sm border border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-700">
          {addError}
        </div>
      )}

      <div className="max-h-full overflow-auto rounded-lg border border-gray-300">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-gray-100">
            <tr>
              {columns.map((column, index) => {
                const isActive = sort?.column === column.key;
                const sortDirection = isActive ? sort.direction : "asc";
                const isSortable =
                  column.key !== "channel" &&
                  column.key !== "actions" &&
                  column.key !== "status";

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
                  colSpan={columns.length}
                >
                  Loading...
                </td>
              </tr>
            ) : sortedRemotes.length === 0 ? (
              <tr>
                <td
                  className="px-3 py-8 text-center text-sm text-gray-500"
                  colSpan={columns.length}
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
                  <td className="border-l border-gray-300 px-3 py-2">
                    {connectionStates?.get(remote.name) ? (
                      <ConnectionStateBadge
                        failureCount={
                          connectionStates.get(remote.name)!.failureCount
                        }
                        state={connectionStates.get(remote.name)!.state}
                      />
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
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
                      className="flex items-center gap-1 rounded-sm bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100"
                      onClick={() => handleViewChannel(remote)}
                      type="button"
                    >
                      View
                      <Icon name="CaretRight" size={12} />
                    </button>
                  </td>
                  {hasRowActions && (
                    <td className="border-l border-gray-300 px-3 py-2">
                      <div className="flex items-center gap-1">
                        {triggerPull && (
                          <button
                            className="rounded-sm bg-gray-100 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200"
                            onClick={() => handlePull(remote)}
                            title="Trigger a single pull cycle for this remote"
                            type="button"
                          >
                            Pull
                          </button>
                        )}
                        {removeRemote && (
                          <button
                            className="rounded-sm bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
                            onClick={() => void handleRemove(remote)}
                            type="button"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </td>
                  )}
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
