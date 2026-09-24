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
import { packageFromConnectorId } from "../../connection-editor/piece-auth.js";
import {
  AUTH_TYPE_LABEL,
  CONNECTION_STATUS_LABEL,
} from "../../connection-editor/status.js";
import {
  pieceDisplayName,
  pieceLogo,
  usePieceLogos,
} from "../../workflow-editor/ui/block-meta.js";
import { DocumentLoadError } from "../../shared/DocumentErrorBoundary.js";
import {
  connectionUsage,
  enabledDependents,
  type UsageWorkflow,
} from "./connection-usage.js";
import {
  CONNECTION_TONE,
  formatAbsolute,
  toneOf,
  TONE_BADGE,
  WORKFLOW_TONE,
} from "./run-format.js";
import { Button, Fact, StatusDot } from "./ui.js";

const CONNECTION_TYPE = "powerhouse/connection";

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
  usePieceLogos();

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

  const statusTone = toneOf(CONNECTION_TONE, state.status);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <header className="mb-8">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex min-w-0 grow items-center gap-2.5">
            <h2 className="min-w-0 truncate text-xl font-semibold tracking-tight text-foreground">
              {state.name || props.node.name || "Untitled connection"}
            </h2>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE_BADGE[statusTone]}`}
            >
              {CONNECTION_STATUS_LABEL[state.status]}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="danger"
              onClick={() => showDeleteNodeModal(props.node)}
            >
              Delete
            </Button>
            <Button onClick={() => setStatus(revoked ? "OK" : "REVOKED")}>
              {revoked ? "Reactivate" : "Revoke"}
            </Button>
            <Button variant="primary" onClick={props.onEdit}>
              Edit connection
            </Button>
          </div>
        </div>
        <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-3">
          <Fact label="Connector" title={packageName || undefined}>
            {packageName ? (
              <span className="inline-flex items-center gap-1.5">
                {pieceLogo(packageName) ? (
                  <img
                    src={pieceLogo(packageName)}
                    alt=""
                    className="h-4 w-4"
                  />
                ) : null}
                {pieceDisplayName(packageName) ?? packageName}
              </span>
            ) : (
              <span className="text-muted-foreground">None picked</span>
            )}
          </Fact>
          <Fact label="Sign-in method">{AUTH_TYPE_LABEL[state.authType]}</Fact>
          <Fact label="Account">
            {state.accountLabel ?? (
              <span className="text-muted-foreground">Unknown</span>
            )}
          </Fact>
          <Fact
            label="Last checked"
            title={
              state.lastCheckedAt
                ? formatAbsolute(state.lastCheckedAt)
                : undefined
            }
          >
            {state.lastCheckedAt ? (
              new Date(state.lastCheckedAt).toLocaleDateString()
            ) : (
              <span className="text-muted-foreground">Never</span>
            )}
          </Fact>
          <Fact label="Secrets">{state.secretRefs.length}</Fact>
          <Fact label="Used by">
            {usage.length === 1 ? "1 workflow" : `${usage.length} workflows`}
            {atRisk > 0 ? (
              <span className="text-muted-foreground"> ({atRisk} enabled)</span>
            ) : null}
          </Fact>
        </dl>
      </header>

      {state.lastError ? (
        <p className="mb-6 rounded-md bg-wf-fail/10 px-3 py-2 text-[13px] text-wf-fail">
          {state.lastError}
        </p>
      ) : null}

      <section className="border-t border-solid border-border pt-6">
        <h3 className="mb-3 text-[13px] font-medium text-foreground">
          Used by
        </h3>
        {usage.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            No workflow uses this connection yet. Pick it on a step in a
            workflow's editor.
          </p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {usage.map((entry) => (
              <li key={entry.workflow.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13px] hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => props.onOpenWorkflow(entry.workflow.id)}
                >
                  <span title={entry.workflow.status} className="flex">
                    <StatusDot
                      tone={toneOf(WORKFLOW_TONE, entry.workflow.status)}
                    />
                  </span>
                  <span className="shrink-0 font-medium text-foreground">
                    {entry.workflow.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[
                      ...(entry.trigger ? ["trigger"] : []),
                      ...entry.steps.map((step) => step.key),
                    ].join(", ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8 border-t border-solid border-border pt-6">
        <h3 className="mb-3 text-[13px] font-medium text-foreground">
          Configuration
        </h3>
        {config.length === 0 && state.secretRefs.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            Nothing configured yet.{" "}
            <button
              type="button"
              className="font-medium text-foreground underline underline-offset-2"
              onClick={props.onEdit}
            >
              Open the editor
            </button>{" "}
            to fill it in.
          </p>
        ) : (
          <dl className="grid grid-cols-[12rem_1fr] gap-x-4 gap-y-2 text-[13px]">
            {config.map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="truncate text-muted-foreground">{key}</dt>
                <dd className="min-w-0 truncate text-foreground">{value}</dd>
              </div>
            ))}
            {state.secretRefs.map((ref) => (
              <div key={ref.id} className="contents">
                <dt className="truncate text-muted-foreground">{ref.name}</dt>
                <dd className="text-muted-foreground">
                  Stored secret, never shown
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </div>
  );
}
