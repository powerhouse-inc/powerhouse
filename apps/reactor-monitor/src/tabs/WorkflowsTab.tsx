/**
 * Per-workflow run history for a reactor whose host runs a workflow engine
 * (multi-reactor §3). Rather than bridging workflow data onto the inspection
 * plane, this REUSES Workflow Studio's standalone runtime client
 * (`@powerhousedao/workflow/editors/runtime`) against the reactor's
 * `/graphql/workflow-runtime` subgraph -- the same data layer the studio reads,
 * so there is one journal, not two.
 *
 * Workflows run on a Node host, not in the browser, so there is a
 * workflow-runtime subgraph only for a remote reactor whose host composed the
 * engine. A local/in-process reactor, and a remote one that reports
 * `serverInfo.workflows` false, get an "unavailable here" panel instead.
 *
 * Plain CSS and a manual load/paging loop, forked from the other inspector tabs
 * rather than pulling in the design system (see QueueTab's header note).
 */
import { subgraphUrlFromGraphqlUrl } from "@powerhousedao/reactor-browser/graphql-client";
import type {
  ManagedReactor,
  ManagedRemoteReactor,
} from "@powerhousedao/reactor-monitor";
import {
  createRuntimeClient,
  runsOfPages,
  type RunPage,
  type RunRecord,
  type RuntimeClient,
  type RuntimeClientOptions,
} from "@powerhousedao/workflow/editors/runtime";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

/** Builds a runtime client bound to one workflow-runtime URL. */
export type CreateRuntimeClient = (
  url: string,
  options: RuntimeClientOptions,
) => RuntimeClient;

export type WorkflowsTabProps = {
  readonly reactor: ManagedReactor;
  /**
   * The runtime-client factory. Defaults to the real one; a test injects a stub
   * to drive the tab off a mocked runtime and to assert the derived URL.
   */
  readonly createClient?: CreateRuntimeClient;
};

const WORKFLOW_RUNTIME_SUBGRAPH = "workflow-runtime";

export function WorkflowsTab({
  reactor,
  createClient = createRuntimeClient,
}: WorkflowsTabProps) {
  if (reactor.kind !== "remote") {
    return (
      <UnavailablePanel>
        Workflows run on a Node host, not in the browser, so a {reactor.kind}{" "}
        reactor has no workflow-runtime subgraph to read. Attach a remote
        reactor whose host runs the workflow engine to see its runs.
      </UnavailablePanel>
    );
  }
  if (!reactor.serverInfo.workflows) {
    return (
      <UnavailablePanel>
        This reactor&apos;s host reports no workflow runtime
        (serverInfo.workflows is false), so there are no workflow runs to show.
        Re-check the server after composing a workflow engine on that host.
      </UnavailablePanel>
    );
  }
  return <WorkflowRuns createClient={createClient} reactor={reactor} />;
}

function UnavailablePanel({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <div className="rm-tab">
      <div className="rm-tab-header">
        <h2>Workflows</h2>
      </div>
      <p className="rm-placeholder" data-testid="workflows-unavailable">
        {children}
      </p>
    </div>
  );
}

/** A fetched run detail: in flight, loaded, or failed. */
type RunDetail =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly run: RunRecord }
  | { readonly status: "error"; readonly message: string };

const COLUMNS = ["Workflow", "Status", "Trigger", "Started", "Ended"] as const;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "—";
}

function statusBadgeClass(status: string): string {
  return status === "SUCCEEDED" ? "rm-badge rm-badge-ok" : "rm-badge";
}

function WorkflowRuns({
  reactor,
  createClient,
}: {
  readonly reactor: ManagedRemoteReactor;
  readonly createClient: CreateRuntimeClient;
}) {
  const runtimeUrl = useMemo(
    () => subgraphUrlFromGraphqlUrl(reactor.url, WORKFLOW_RUNTIME_SUBGRAPH),
    [reactor.url],
  );

  const client = useMemo(() => {
    const baseFetch: typeof fetch =
      reactor.fetch ?? ((input, init) => fetch(input, init));
    const headersProvider = reactor.headers;
    const authedFetch: typeof fetch = headersProvider
      ? async (input, init) => {
          const extra = await headersProvider();
          const headers = new Headers(init?.headers);
          for (const [name, value] of Object.entries(extra)) {
            headers.set(name, value);
          }
          return baseFetch(input, { ...init, headers });
        }
      : baseFetch;
    // Never the ambient Renown token (window.ph): the monitor reaches a sibling
    // subgraph with the SAME inspection auth it already carries for this
    // reactor, threaded through `fetch`.
    const options: RuntimeClientOptions = {
      fetch: authedFetch,
      token: () => Promise.resolve(null),
    };
    return createClient(runtimeUrl, options);
  }, [reactor, runtimeUrl, createClient]);

  const [pages, setPages] = useState<RunPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, RunDetail>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await client.fetchRunsPage({}, null);
      setPages([page]);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks-extra/set-state-in-effect
    void load();
  }, [load]);

  const lastPage = pages.at(-1);
  const hasNext = Boolean(lastPage?.hasNextPage && lastPage.cursor);

  const loadMore = useCallback(async () => {
    const cursor = pages.at(-1)?.cursor ?? null;
    setLoadingMore(true);
    try {
      const page = await client.fetchRunsPage({}, cursor);
      setPages((previous) => [...previous, page]);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }, [client, pages]);

  const loadDetail = useCallback(
    async (runId: string) => {
      setDetails((previous) => ({
        ...previous,
        [runId]: { status: "loading" },
      }));
      try {
        const run = await client.fetchRun(runId);
        setDetails((previous) => ({
          ...previous,
          [runId]: run
            ? { status: "ready", run }
            : { status: "error", message: "Run not found" },
        }));
      } catch (e) {
        setDetails((previous) => ({
          ...previous,
          [runId]: { status: "error", message: errorMessage(e) },
        }));
      }
    },
    [client],
  );

  const toggleRun = useCallback(
    (runId: string) => {
      if (expandedRunId === runId) {
        setExpandedRunId(null);
        return;
      }
      setExpandedRunId(runId);
      if (!Object.hasOwn(details, runId)) {
        void loadDetail(runId);
      }
    },
    [expandedRunId, details, loadDetail],
  );

  const runs = useMemo(() => runsOfPages(pages), [pages]);

  return (
    <div className="rm-tab">
      <div className="rm-tab-header">
        <h2>Workflows</h2>
        <div className="rm-actions">
          <button
            className="rm-btn"
            disabled={loading}
            onClick={() => void load()}
            type="button"
          >
            Refresh
          </button>
        </div>
      </div>

      {error ? <p className="rm-error">{error}</p> : null}

      <div className="rm-stat-bar" data-testid="workflows-counts">
        <span>
          Runs: <strong>{runs.length}</strong>
        </span>
      </div>

      <div className="rm-table-wrap">
        <table className="rm-table">
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && runs.length === 0 ? (
              <tr>
                <td className="rm-table-empty" colSpan={COLUMNS.length}>
                  Loading...
                </td>
              </tr>
            ) : runs.length === 0 ? (
              <tr>
                <td className="rm-table-empty" colSpan={COLUMNS.length}>
                  No workflow runs yet.
                </td>
              </tr>
            ) : (
              runs.map((run) => (
                <Fragment key={run.id}>
                  <tr
                    className="rm-row-clickable"
                    data-testid="workflows-run-row"
                    onClick={() => toggleRun(run.id)}
                  >
                    <td title={run.workflowId}>{run.workflowName}</td>
                    <td>
                      <span className={statusBadgeClass(run.status)}>
                        {run.status}
                      </span>
                    </td>
                    <td>{run.triggerKind}</td>
                    <td>{formatTime(run.startedAt)}</td>
                    <td>{formatTime(run.endedAt)}</td>
                  </tr>
                  {expandedRunId === run.id ? (
                    <tr>
                      <td colSpan={COLUMNS.length}>
                        <RunDetailView detail={details[run.id]} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="rm-actions">
        {hasNext ? (
          <button
            className="rm-btn"
            data-testid="workflows-load-more"
            disabled={loadingMore}
            onClick={() => void loadMore()}
            type="button"
          >
            {loadingMore ? "Loading..." : "Load more"}
          </button>
        ) : null}
      </div>
      <p className="rm-note">Showing {runs.length} run(s)</p>
    </div>
  );
}

function RunDetailView({ detail }: { readonly detail: RunDetail | undefined }) {
  if (!detail || detail.status === "loading") {
    return (
      <p className="rm-note" data-testid="workflows-run-detail">
        Loading run detail...
      </p>
    );
  }
  if (detail.status === "error") {
    return (
      <p className="rm-error" data-testid="workflows-run-detail">
        {detail.message}
      </p>
    );
  }
  const { run } = detail;
  return (
    <div data-testid="workflows-run-detail">
      {run.error ? <p className="rm-error">{run.error}</p> : null}
      <table className="rm-table">
        <thead>
          <tr>
            <th>Step</th>
            <th>Piece</th>
            <th>Status</th>
            <th>Started</th>
            <th>Ended</th>
          </tr>
        </thead>
        <tbody>
          {run.steps.length === 0 ? (
            <tr>
              <td className="rm-table-empty" colSpan={5}>
                No steps recorded.
              </td>
            </tr>
          ) : (
            run.steps.map((step) => (
              <tr data-testid="workflows-step-row" key={step.stepId}>
                <td title={step.stepId}>{step.blockName}</td>
                <td>{step.pieceName}</td>
                <td>
                  <span className={statusBadgeClass(step.status)}>
                    {step.status}
                  </span>
                </td>
                <td>{formatTime(step.startedAt)}</td>
                <td>{formatTime(step.endedAt)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default WorkflowsTab;
