/**
 * Ported from
 * packages/design-system/src/connect/components/queue-inspector/queue-inspector.tsx.
 *
 * The design-system component is prop-driven and would otherwise be a clean
 * deep import (`@powerhousedao/design-system/connect/components/queue-inspector`),
 * but it imports `Icon` from the package's private `#design-system` import
 * alias (only resolvable inside that package's own package.json, not from
 * here), renders with Tailwind utility classes against the design-system
 * theme tokens, and opens a shared `ObjectInspectorModal`. Pulling any of
 * that in would mean adding Tailwind and the design-system's theme CSS to
 * this app for one tab, which W0.4 explicitly avoids ("no tailwind unless
 * the deep-imported components require their CSS" — this one does, so it is
 * forked instead). This port keeps the same prop contract and behavior
 * (poll every 2s, pause/resume, sortable columns) in plain CSS, and replaces
 * the "View" modal with an inline expandable row.
 */
import type { IInspector, Job } from "@powerhousedao/reactor";
import { Fragment, useCallback, useEffect, useState } from "react";

export type QueueTabProps = {
  readonly inspector: IInspector;
};

type JobWithStatus = Job & { status: "pending" | "executing" };

type SortColumn =
  | "id"
  | "kind"
  | "documentId"
  | "scope"
  | "branch"
  | "createdAt";
type SortDirection = "asc" | "desc";

const COLUMNS: { key: SortColumn; label: string }[] = [
  { key: "id", label: "ID" },
  { key: "kind", label: "Kind" },
  { key: "documentId", label: "Document ID" },
  { key: "scope", label: "Scope" },
  { key: "branch", label: "Branch" },
  { key: "createdAt", label: "Created At" },
];

const POLL_INTERVAL_MS = 2000;

function sortJobs(
  jobs: JobWithStatus[],
  sort: { column: SortColumn; direction: SortDirection } | undefined,
): JobWithStatus[] {
  if (!sort) {
    return jobs;
  }
  const { column, direction } = sort;
  const sorted = [...jobs].sort((a, b) => a[column].localeCompare(b[column]));
  return direction === "asc" ? sorted : sorted.reverse();
}

export function QueueTab({ inspector }: QueueTabProps) {
  const [state, setState] = useState<{
    isPaused: boolean;
    pendingJobs: Job[];
    executingJobs: Job[];
    totalPending: number;
    totalExecuting: number;
  }>({
    isPaused: false,
    pendingJobs: [],
    executingJobs: [],
    totalPending: 0,
    totalExecuting: 0,
  });
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<
    { column: SortColumn; direction: SortDirection } | undefined
  >();
  const [actionInProgress, setActionInProgress] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    const snapshot = await inspector.getQueueState();
    setState(snapshot);
    setLoading(false);
  }, [inspector]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks-extra/set-state-in-effect
    void loadState();
    const interval = setInterval(() => void loadState(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadState]);

  const handlePauseResume = useCallback(async () => {
    setActionInProgress(true);
    if (state.isPaused) {
      await inspector.resumeQueue();
    } else {
      await inspector.pauseQueue();
    }
    await loadState();
    setActionInProgress(false);
  }, [state.isPaused, inspector, loadState]);

  const handleSort = (column: SortColumn) => {
    setSort((previous) => ({
      column,
      direction:
        previous?.column === column && previous.direction === "asc"
          ? "desc"
          : "asc",
    }));
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
    <div className="rm-tab">
      <div className="rm-tab-header">
        <h2>Queue</h2>
        <div className="rm-actions">
          <button
            className={state.isPaused ? "rm-btn rm-btn-warn" : "rm-btn"}
            disabled={actionInProgress}
            onClick={() => void handlePauseResume()}
            type="button"
          >
            {state.isPaused ? "Resume" : "Pause"}
          </button>
          <button
            className="rm-btn"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              void loadState();
            }}
            type="button"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="rm-stat-bar">
        <span
          className={state.isPaused ? "rm-dot rm-dot-warn" : "rm-dot rm-dot-ok"}
        />
        <span>{state.isPaused ? "Paused" : "Running"}</span>
        <span>
          Pending: <strong>{state.totalPending}</strong>
        </span>
        <span>
          Executing: <strong>{state.totalExecuting}</strong>
        </span>
      </div>

      <div className="rm-table-wrap">
        <table className="rm-table">
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th key={column.key} onClick={() => handleSort(column.key)}>
                  {column.label}
                  {sort?.column === column.key
                    ? sort.direction === "asc"
                      ? " ▲"
                      : " ▼"
                    : ""}
                </th>
              ))}
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && sortedJobs.length === 0 ? (
              <tr>
                <td className="rm-table-empty" colSpan={COLUMNS.length + 1}>
                  Loading...
                </td>
              </tr>
            ) : sortedJobs.length === 0 ? (
              <tr>
                <td className="rm-table-empty" colSpan={COLUMNS.length + 1}>
                  No jobs in queue
                </td>
              </tr>
            ) : (
              sortedJobs.map((job) => (
                <Fragment key={job.id}>
                  <tr
                    className="rm-row-clickable"
                    onClick={() =>
                      setExpandedJobId(expandedJobId === job.id ? null : job.id)
                    }
                  >
                    <td title={job.id}>{job.id}</td>
                    <td>{job.kind}</td>
                    <td title={job.documentId}>{job.documentId}</td>
                    <td>{job.scope}</td>
                    <td>{job.branch}</td>
                    <td>{new Date(job.createdAt).toLocaleString()}</td>
                    <td>
                      <span
                        className={
                          job.status === "executing"
                            ? "rm-badge rm-badge-ok"
                            : "rm-badge"
                        }
                      >
                        {job.status}
                      </span>
                    </td>
                  </tr>
                  {expandedJobId === job.id ? (
                    <tr>
                      <td colSpan={COLUMNS.length + 1}>
                        <pre className="rm-json">
                          {JSON.stringify(job, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="rm-note">Showing {sortedJobs.length} job(s)</p>
    </div>
  );
}

export default QueueTab;
