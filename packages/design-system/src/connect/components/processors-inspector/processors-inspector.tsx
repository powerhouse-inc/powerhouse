import { Icon } from "#design-system";
import { useCallback, useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";
import { ObjectInspectorModal } from "../object-inspector-modal/index.js";

export type ProcessorInfo = {
  processorId: string;
  factoryId: string;
  driveId: string;
  processorIndex: number;
  lastOrdinal: number;
  status: "active" | "errored";
  lastError: string | undefined;
  lastErrorTimestamp: Date | undefined;
};

export type ProcessorsInspectorProps = {
  readonly getProcessors: () => Promise<ProcessorInfo[]>;
  readonly onRetry?: (processorId: string) => Promise<void>;
};

type SortDirection = "asc" | "desc";

type SortOptions = {
  readonly column: string;
  readonly direction: SortDirection;
};

type ColumnDef = {
  readonly key: string;
  readonly label: string;
  readonly width?: string;
};

const VIEW_COLUMN: ColumnDef = { key: "view", label: "", width: "60px" };

const COLUMNS: ColumnDef[] = [
  VIEW_COLUMN,
  { key: "status", label: "Status", width: "90px" },
  { key: "processorId", label: "Processor ID", width: "150px" },
  { key: "factoryId", label: "Factory ID", width: "150px" },
  { key: "driveId", label: "Drive ID", width: "150px" },
  { key: "processorIndex", label: "Index", width: "70px" },
  { key: "lastOrdinal", label: "Last Ordinal", width: "100px" },
  { key: "lastError", label: "Error", width: "180px" },
  { key: "lastErrorTimestamp", label: "Error At", width: "160px" },
  { key: "actions", label: "Actions", width: "80px" },
];

function truncateId(id: string, maxLength: number = 12): string {
  if (id.length <= maxLength) return id;
  return id.slice(0, maxLength) + "...";
}

function sortProcessors(
  processors: ProcessorInfo[],
  sort: SortOptions | undefined,
): ProcessorInfo[] {
  if (!sort) return processors;

  return [...processors].sort((a, b) => {
    let comparison: number;

    switch (sort.column) {
      case "status":
        comparison = a.status.localeCompare(b.status);
        break;
      case "processorId":
        comparison = a.processorId.localeCompare(b.processorId);
        break;
      case "factoryId":
        comparison = a.factoryId.localeCompare(b.factoryId);
        break;
      case "driveId":
        comparison = a.driveId.localeCompare(b.driveId);
        break;
      case "processorIndex":
        comparison = a.processorIndex - b.processorIndex;
        break;
      case "lastOrdinal":
        comparison = a.lastOrdinal - b.lastOrdinal;
        break;
      case "lastError":
        comparison = (a.lastError ?? "").localeCompare(b.lastError ?? "");
        break;
      case "lastErrorTimestamp":
        comparison =
          (a.lastErrorTimestamp?.getTime() ?? 0) -
          (b.lastErrorTimestamp?.getTime() ?? 0);
        break;
      default:
        return 0;
    }

    return sort.direction === "asc" ? comparison : -comparison;
  });
}

function SortIcon({
  direction,
  active,
}: {
  direction: SortDirection;
  active: boolean;
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

export function ProcessorsInspector({
  getProcessors,
  onRetry,
}: ProcessorsInspectorProps) {
  const [processors, setProcessors] = useState<ProcessorInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortOptions | undefined>();
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [selectedProcessor, setSelectedProcessor] =
    useState<ProcessorInfo | null>(null);

  const [error, setError] = useState<string | null>(null);

  const loadProcessors = useCallback(async () => {
    try {
      const result = await getProcessors();
      setProcessors(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [getProcessors]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProcessors();

    const interval = setInterval(() => {
      void loadProcessors();
    }, 2000);

    return () => clearInterval(interval);
  }, [loadProcessors]);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    await loadProcessors();
  }, [loadProcessors]);

  const handleRetry = useCallback(
    async (processorId: string) => {
      if (!onRetry) return;
      setRetryingId(processorId);
      try {
        await onRetry(processorId);
        await loadProcessors();
      } finally {
        setRetryingId(null);
      }
    },
    [onRetry, loadProcessors],
  );

  const handleSort = (columnKey: string) => {
    const newDirection: SortDirection =
      sort?.column === columnKey && sort.direction === "asc" ? "desc" : "asc";

    setSort({ column: columnKey, direction: newDirection });
  };

  const sortedProcessors = sortProcessors(processors, sort);

  const activeCount = processors.filter((p) => p.status === "active").length;
  const erroredCount = processors.filter((p) => p.status === "errored").length;

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex shrink-0 items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          Processors Inspector
        </h2>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1 rounded-sm border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:hover-effect disabled:disabled-effect"
            disabled={loading}
            onClick={() => void handleRefresh()}
            type="button"
          >
            <Icon name="Reload" size={14} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-4 rounded-lg bg-muted px-4 py-2 text-sm">
        <div className="text-foreground">
          Total: <span className="font-medium">{processors.length}</span>
        </div>
        <div className="flex items-center gap-2 text-foreground">
          <span className="size-2 rounded-full bg-success" />
          Active: <span className="font-medium">{activeCount}</span>
        </div>
        <div className="flex items-center gap-2 text-foreground">
          <span className="size-2 rounded-full bg-destructive" />
          Errored: <span className="font-medium">{erroredCount}</span>
        </div>
      </div>

      {error && (
        <div className="shrink-0 rounded-lg border border-destructive bg-destructive/10 px-4 py-2 text-sm text-destructive">
          Failed to load processors: {error}
        </div>
      )}

      <div className="max-h-full overflow-auto rounded-lg border border-border">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-muted">
            <tr>
              {COLUMNS.map((column, index) => {
                const isActive = sort?.column === column.key;
                const sortDirection = isActive ? sort.direction : "asc";

                return (
                  <th
                    key={column.key}
                    className={twMerge(
                      "group cursor-pointer px-3 py-2 text-left text-xs font-medium text-foreground hover:hover-effect",
                      index > 0 && "border-l border-border",
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
            {loading && sortedProcessors.length === 0 ? (
              <tr>
                <td
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                  colSpan={COLUMNS.length}
                >
                  Loading...
                </td>
              </tr>
            ) : sortedProcessors.length === 0 ? (
              <tr>
                <td
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                  colSpan={COLUMNS.length}
                >
                  No processors registered
                </td>
              </tr>
            ) : (
              sortedProcessors.map((processor) => (
                <tr
                  key={processor.processorId}
                  className={twMerge(
                    "hover:hover-effect",
                    processor.status === "errored"
                      ? "bg-destructive/10"
                      : "odd:bg-card even:bg-background",
                  )}
                >
                  <td className="px-3 py-2 text-xs">
                    <button
                      className="flex items-center gap-1 rounded-sm bg-info/10 px-2 py-1 text-xs text-info hover:hover-effect"
                      onClick={() => setSelectedProcessor(processor)}
                      type="button"
                    >
                      View
                    </button>
                  </td>
                  <td className="border-l border-border px-3 py-2 text-xs">
                    <span
                      className={twMerge(
                        "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5",
                        processor.status === "active"
                          ? "bg-success/10 text-success"
                          : "bg-destructive/10 text-destructive",
                      )}
                    >
                      {processor.status === "active" && (
                        <span className="inline-block size-1.5 rounded-full bg-success" />
                      )}
                      {processor.status === "errored" && (
                        <span className="inline-block size-1.5 rounded-full bg-destructive" />
                      )}
                      {processor.status}
                    </span>
                  </td>
                  <td className="border-l border-border px-3 py-2 text-xs text-foreground">
                    <span
                      className="block truncate"
                      title={processor.processorId}
                    >
                      {truncateId(processor.processorId)}
                    </span>
                  </td>
                  <td className="border-l border-border px-3 py-2 text-xs text-foreground">
                    <span
                      className="block truncate"
                      title={processor.factoryId}
                    >
                      {truncateId(processor.factoryId)}
                    </span>
                  </td>
                  <td className="border-l border-border px-3 py-2 text-xs text-foreground">
                    <span className="block truncate" title={processor.driveId}>
                      {truncateId(processor.driveId)}
                    </span>
                  </td>
                  <td className="border-l border-border px-3 py-2 text-xs text-foreground">
                    {processor.processorIndex}
                  </td>
                  <td className="border-l border-border px-3 py-2 text-xs text-foreground">
                    {processor.lastOrdinal}
                  </td>
                  <td className="border-l border-border px-3 py-2 text-xs text-foreground">
                    {processor.lastError ? (
                      <span
                        className="block truncate text-destructive"
                        title={processor.lastError}
                      >
                        {processor.lastError}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="border-l border-border px-3 py-2 text-xs text-foreground">
                    {processor.lastErrorTimestamp ? (
                      <span
                        className="block truncate"
                        title={processor.lastErrorTimestamp.toISOString()}
                      >
                        {processor.lastErrorTimestamp.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="border-l border-border px-3 py-2 text-xs">
                    {processor.status === "errored" && onRetry && (
                      <button
                        className="flex items-center gap-1 rounded-sm bg-warning/10 px-2 py-1 text-xs text-warning hover:hover-effect disabled:disabled-effect"
                        disabled={retryingId === processor.processorId}
                        onClick={() => void handleRetry(processor.processorId)}
                        type="button"
                      >
                        Retry
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="shrink-0 text-sm text-foreground">
        Showing {sortedProcessors.length} processor(s)
      </div>

      <ObjectInspectorModal
        object={selectedProcessor}
        onOpenChange={(open) => !open && setSelectedProcessor(null)}
        open={selectedProcessor !== null}
        title="Processor"
      />
    </div>
  );
}
