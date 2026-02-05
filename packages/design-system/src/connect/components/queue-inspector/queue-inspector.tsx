import { Icon } from "@powerhousedao/design-system";
import type { Job } from "@powerhousedao/reactor";
import { useCallback, useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";
import { ObjectInspectorModal } from "../object-inspector-modal/index.js";

export type QueueState = {
  readonly isPaused: boolean;
  readonly pendingJobs: Job[];
  readonly executingJobs: Job[];
  readonly totalPending: number;
  readonly totalExecuting: number;
};

export type QueueInspectorProps = {
  readonly getQueueState: () => Promise<QueueState>;
  readonly onPause: () => Promise<void>;
  readonly onResume: () => Promise<void>;
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
  { key: "id", label: "ID", width: "120px" },
  { key: "kind", label: "Kind", width: "80px" },
  { key: "documentId", label: "Document ID", width: "150px" },
  { key: "scope", label: "Scope", width: "100px" },
  { key: "branch", label: "Branch", width: "100px" },
  { key: "createdAt", label: "Created At", width: "160px" },
  { key: "retryCount", label: "Retries", width: "70px" },
  { key: "status", label: "Status", width: "100px" },
];

function truncateId(id: string, maxLength: number = 12): string {
  if (id.length <= maxLength) return id;
  return id.slice(0, maxLength) + "...";
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString();
}

type JobWithStatus = Job & { status: "pending" | "executing" };

function sortJobs(
  jobs: JobWithStatus[],
  sort: SortOptions | undefined,
): JobWithStatus[] {
  if (!sort) return jobs;

  return [...jobs].sort((a, b) => {
    let comparison = 0;

    switch (sort.column) {
      case "id":
        comparison = a.id.localeCompare(b.id);
        break;
      case "kind":
        comparison = a.kind.localeCompare(b.kind);
        break;
      case "documentId":
        comparison = a.documentId.localeCompare(b.documentId);
        break;
      case "scope":
        comparison = a.scope.localeCompare(b.scope);
        break;
      case "branch":
        comparison = a.branch.localeCompare(b.branch);
        break;
      case "createdAt":
        comparison = a.createdAt.localeCompare(b.createdAt);
        break;
      case "retryCount":
        comparison = (a.retryCount ?? 0) - (b.retryCount ?? 0);
        break;
      case "status":
        comparison = a.status.localeCompare(b.status);
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

export function QueueInspector({
  getQueueState,
  onPause,
  onResume,
}: QueueInspectorProps) {
  const [state, setState] = useState<QueueState>({
    isPaused: false,
    pendingJobs: [],
    executingJobs: [],
    totalPending: 0,
    totalExecuting: 0,
  });
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortOptions | undefined>();
  const [actionInProgress, setActionInProgress] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobWithStatus | null>(null);

  const loadState = useCallback(async () => {
    const newState = await getQueueState();
    setState(newState);
    setLoading(false);
  }, [getQueueState]);

  useEffect(() => {
    void loadState();

    const interval = setInterval(() => {
      void loadState();
    }, 2000);

    return () => clearInterval(interval);
  }, [loadState]);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    await loadState();
  }, [loadState]);

  const handlePauseResume = useCallback(async () => {
    setActionInProgress(true);
    if (state.isPaused) {
      await onResume();
    } else {
      await onPause();
    }
    await loadState();
    setActionInProgress(false);
  }, [state.isPaused, onPause, onResume, loadState]);

  const handleSort = (columnKey: string) => {
    const newDirection: SortDirection =
      sort?.column === columnKey && sort.direction === "asc" ? "desc" : "asc";

    setSort({ column: columnKey, direction: newDirection });
  };

  const allJobs: JobWithStatus[] = [
    ...state.executingJobs.map((job) => ({
      ...job,
      status: "executing" as const,
    })),
    ...state.pendingJobs.map((job) => ({ ...job, status: "pending" as const })),
  ];

  const sortedJobs = sortJobs(allJobs, sort);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex shrink-0 items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Queue Inspector</h2>
        <div className="flex items-center gap-2">
          <button
            className={twMerge(
              "flex items-center gap-1 rounded border px-3 py-1.5 text-sm disabled:opacity-50",
              state.isPaused
                ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
                : "border-yellow-300 bg-yellow-50 text-yellow-700 hover:bg-yellow-100",
            )}
            disabled={actionInProgress}
            onClick={() => void handlePauseResume()}
            type="button"
          >
            <Icon
              name={state.isPaused ? "ArrowFilledRight" : "Ellipsis"}
              size={14}
            />
            {state.isPaused ? "Resume" : "Pause"}
          </button>
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
      </div>

      <div className="flex shrink-0 items-center gap-4 rounded-lg bg-gray-100 px-4 py-2 text-sm">
        <div className="flex items-center gap-2">
          <span
            className={twMerge(
              "size-2 rounded-full",
              state.isPaused ? "bg-yellow-500" : "bg-green-500",
            )}
          />
          <span className="font-medium text-gray-700">
            {state.isPaused ? "Paused" : "Running"}
          </span>
        </div>
        <div className="text-gray-600">
          Pending: <span className="font-medium">{state.totalPending}</span>
        </div>
        <div className="text-gray-600">
          Executing: <span className="font-medium">{state.totalExecuting}</span>
        </div>
      </div>

      <div className="max-h-full overflow-auto rounded-lg border border-gray-300">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-gray-100">
            <tr>
              {COLUMNS.map((column, index) => {
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
            {loading && sortedJobs.length === 0 ? (
              <tr>
                <td
                  className="px-3 py-8 text-center text-sm text-gray-500"
                  colSpan={COLUMNS.length}
                >
                  Loading...
                </td>
              </tr>
            ) : sortedJobs.length === 0 ? (
              <tr>
                <td
                  className="px-3 py-8 text-center text-sm text-gray-500"
                  colSpan={COLUMNS.length}
                >
                  No jobs in queue
                </td>
              </tr>
            ) : (
              sortedJobs.map((job) => (
                <tr
                  key={job.id}
                  className="odd:bg-white even:bg-gray-50 hover:bg-blue-50"
                >
                  <td className="px-3 py-2 text-xs">
                    <button
                      className="flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100"
                      onClick={() => setSelectedJob(job)}
                      type="button"
                    >
                      View
                    </button>
                  </td>
                  <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">
                    <span className="block truncate" title={job.id}>
                      {truncateId(job.id)}
                    </span>
                  </td>
                  <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">
                    <span
                      className={twMerge(
                        "inline-block rounded px-1.5 py-0.5",
                        job.kind === "mutation"
                          ? "bg-purple-100 text-purple-700"
                          : "bg-blue-100 text-blue-700",
                      )}
                    >
                      {job.kind}
                    </span>
                  </td>
                  <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">
                    <span className="block truncate" title={job.documentId}>
                      {truncateId(job.documentId)}
                    </span>
                  </td>
                  <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">
                    <span className="block truncate" title={job.scope}>
                      {job.scope}
                    </span>
                  </td>
                  <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">
                    <span className="block truncate" title={job.branch}>
                      {job.branch}
                    </span>
                  </td>
                  <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">
                    <span className="block truncate" title={job.createdAt}>
                      {formatDate(job.createdAt)}
                    </span>
                  </td>
                  <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">
                    {job.retryCount ?? 0}
                  </td>
                  <td className="border-l border-gray-300 px-3 py-2 text-xs">
                    <span
                      className={twMerge(
                        "inline-flex items-center gap-1 rounded px-1.5 py-0.5",
                        job.status === "executing"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600",
                      )}
                    >
                      {job.status === "executing" && (
                        <span className="inline-block size-1.5 animate-pulse rounded-full bg-green-500" />
                      )}
                      {job.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="shrink-0 text-sm text-gray-600">
        Showing {sortedJobs.length} job(s)
      </div>

      <ObjectInspectorModal
        object={selectedJob}
        onOpenChange={(open) => !open && setSelectedJob(null)}
        open={selectedJob !== null}
        title="Job"
      />
    </div>
  );
}
