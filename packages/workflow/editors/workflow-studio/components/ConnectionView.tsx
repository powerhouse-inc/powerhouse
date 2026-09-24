// A connection's view mode: what it connects to, how it is configured, and
// which workflows would break if it went away.
import {
  showDeleteNodeModal,
  useDispatch,
  useDocumentSafe,
} from "@powerhousedao/reactor-browser";
import type { FileNode } from "@powerhousedao/shared/document-drive";
import {
  actions as connectionActions,
  type ConnectionDocument,
} from "document-models/connection";
import { useWorkflowDocumentsInSelectedDrive } from "document-models/workflow";
import type { ReactNode } from "react";
import { CONNECTION_STATUS_STYLES } from "../../connection-editor/status.js";
import { packageFromConnectorId } from "../../connection-editor/piece-auth.js";
import { DocumentLoadError } from "../../shared/DocumentErrorBoundary.js";
import {
  connectionUsage,
  enabledDependents,
  type UsageWorkflow,
} from "./connection-usage.js";
import { formatAbsolute, WORKFLOW_STATUS_DOT } from "./run-format.js";

const CONNECTION_TYPE = "powerhouse/connection";

const ACTION =
  "rounded border border-solid border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50";

function Stat(props: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 grow border-l border-solid border-slate-200 px-3 py-2 first:border-l-0 first:pl-0">
      <div className="text-[11px] text-slate-400">{props.label}</div>
      <div className="truncate text-xs text-slate-800">{props.children}</div>
    </div>
  );
}

function configEntries(config: unknown): [string, string][] {
  if (!config || typeof config !== "object" || Array.isArray(config)) return [];
  return Object.entries(config as Record<string, unknown>).map(
    ([key, value]) => [
      key,
      typeof value === "string" ? value : JSON.stringify(value),
    ],
  );
}

export function ConnectionView(props: {
  node: FileNode;
  onEdit: () => void;
  onOpenWorkflow: (workflowId: string) => void;
}) {
  const connectionId = props.node.id;
  const { data: document, error, reload } = useDocumentSafe(connectionId);
  const [, dispatch] = useDispatch(document);
  const workflows = useWorkflowDocumentsInSelectedDrive();

  if (error !== undefined) {
    return (
      <DocumentLoadError
        title="This connection could not be loaded"
        documentId={connectionId}
        error={error}
        onRetry={() => {
          void reload();
        }}
      />
    );
  }
  if (document?.header.documentType !== CONNECTION_TYPE) return null;

  const state = (document as ConnectionDocument).state.global;
  const revoked = state.status === "REVOKED";
  const packageName = packageFromConnectorId(state.connectorId);
  const usage = connectionUsage(
    connectionId,
    (workflows ?? []).map((workflow): UsageWorkflow => ({
      id: workflow.header.id,
      name: workflow.state.global.name || workflow.header.name || "Untitled",
      status: workflow.state.global.status,
      trigger: workflow.state.global.trigger,
      steps: workflow.state.global.steps,
    })),
  );
  const atRisk = enabledDependents(usage);
  const config = configEntries(state.config);

  const setStatus = (status: "OK" | "REVOKED") =>
    dispatch(
      connectionActions.recordCheckResult({
        status,
        checkedAt: new Date().toISOString(),
      }),
    );

  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <header className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 truncate text-base font-semibold text-slate-800">
            {state.name || props.node.name || "Untitled connection"}
          </h2>
          <span
            className={`rounded px-2 py-0.5 text-[11px] font-semibold ${CONNECTION_STATUS_STYLES[state.status]}`}
          >
            {state.status}
          </span>
          <span className="grow" />
          <button type="button" className={ACTION} onClick={props.onEdit}>
            Edit connection
          </button>
          <button
            type="button"
            className={ACTION}
            onClick={() => setStatus(revoked ? "OK" : "REVOKED")}
          >
            {revoked ? "Reactivate" : "Revoke"}
          </button>
          <button
            type="button"
            className="rounded border border-solid border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-600 hover:border-red-300 hover:bg-red-50"
            onClick={() => showDeleteNodeModal(props.node)}
          >
            Delete
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-stretch rounded-md border border-solid border-slate-200 bg-white px-3">
          <Stat label="Connector">
            {packageName || <span className="text-slate-400">None picked</span>}
          </Stat>
          <Stat label="Auth">{state.authType}</Stat>
          <Stat label="Account">
            {state.accountLabel ?? <span className="text-slate-400">—</span>}
          </Stat>
          <Stat label="Last checked">
            {state.lastCheckedAt ? (
              formatAbsolute(state.lastCheckedAt)
            ) : (
              <span className="text-slate-400">Never</span>
            )}
          </Stat>
          <Stat label="Secrets">
            <span className="tabular-nums">{state.secretRefs.length}</span>
          </Stat>
          <Stat label="Used by">
            <span className="tabular-nums">
              {usage.length}
              {atRisk > 0 ? (
                <span className="text-slate-400"> · {atRisk} enabled</span>
              ) : null}
            </span>
          </Stat>
        </div>
      </header>

      {state.lastError ? (
        <p className="mb-4 rounded bg-red-50 px-3 py-2 text-xs text-red-600">
          {state.lastError}
        </p>
      ) : null}

      <section className="mb-4 rounded-md border border-solid border-slate-200 bg-white px-3 py-3">
        <h3 className="mb-2 text-[11px] text-slate-400">Used by</h3>
        {usage.length === 0 ? (
          <p className="text-xs text-slate-500">
            No workflow uses this connection yet. Bind it to a step in a
            workflow's editor.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {usage.map((entry) => (
              <li key={entry.workflow.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-slate-50"
                  onClick={() => props.onOpenWorkflow(entry.workflow.id)}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${WORKFLOW_STATUS_DOT[entry.workflow.status] ?? "bg-slate-300"}`}
                    title={entry.workflow.status}
                  />
                  <span className="shrink-0 text-xs font-medium text-slate-700">
                    {entry.workflow.name}
                  </span>
                  <span className="truncate text-[11px] text-slate-400">
                    {entry.trigger ? "trigger" : null}
                    {entry.trigger && entry.steps.length > 0 ? " · " : null}
                    {entry.steps.map((step) => step.key).join(", ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-md border border-solid border-slate-200 bg-white px-3 py-3">
        <h3 className="mb-2 text-[11px] text-slate-400">Configuration</h3>
        {config.length === 0 && state.secretRefs.length === 0 ? (
          <p className="text-xs text-slate-500">
            Nothing configured yet.{" "}
            <button
              type="button"
              className="underline hover:text-slate-800"
              onClick={props.onEdit}
            >
              Open the editor
            </button>{" "}
            to fill it in.
          </p>
        ) : (
          <dl className="flex flex-col gap-1">
            {config.map(([key, value]) => (
              <div key={key} className="flex gap-2 text-xs">
                <dt className="w-40 shrink-0 truncate text-slate-500">{key}</dt>
                <dd className="min-w-0 truncate text-slate-800">{value}</dd>
              </div>
            ))}
            {state.secretRefs.map((ref) => (
              <div key={ref.id} className="flex gap-2 text-xs">
                <dt className="w-40 shrink-0 truncate text-slate-500">
                  {ref.name}
                </dt>
                <dd className="text-slate-400">
                  stored secret · never displayed
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </div>
  );
}
