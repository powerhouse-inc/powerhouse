import "@xyflow/react/dist/style.css";
import "./ui/canvas.css";
import {
  useFileNodesInSelectedDrive,
  useSelectedDocumentId,
  useSelectedDriveId,
} from "@powerhousedao/reactor-browser";
import { useSelectedWorkflowDocument } from "document-models/workflow";
import { WORKFLOW_UNDO } from "./undo-policy.js";
import { useMemo } from "react";
import { useWorkflowModel } from "./document/useWorkflowModel.js";
import type { BlockRef } from "@powerhousedao/pieces-framework/block-type";
import type { OutputTreeNode, RuntimeClient } from "./runtime-client.js";
import {
  useRunsQuery,
  useRuntime,
  useRuntimeActions,
  WorkflowRuntimeProvider,
} from "./runtime-context.js";
import {
  LATEST_RUN_WINDOW,
  outputTreeQuery,
  runsQuery,
  stepOutputTreeQuery,
} from "./runtime-queries.js";
import { realRuns, TEST_TRIGGER_KIND } from "./run-kinds.js";
import type { QueryClient } from "@tanstack/react-query";
import { BackButton, UndoRedo } from "../shared/editor-chrome.js";
import {
  formatAbsolute,
  formatDuration,
  formatWhen,
  RUN_TONE,
  toneOf,
  TONE_DOT,
  TONE_TEXT,
} from "../workflow-studio/components/run-format.js";
import { buildExpressionScope, EMPTY_SCOPE } from "./ui/expression-scope.js";
import { DesignTimeProvider } from "./ui/design-time.js";
import {
  ExpressionScopeSourceProvider,
  type ExpressionScopeSource,
} from "./ui/ExpressionPicker.js";
import type { DesignTimeService } from "./ui/forms.js";
import { DocumentErrorBoundary } from "../shared/DocumentErrorBoundary.js";
import { WorkflowEditorApp } from "./ui/WorkflowEditorApp.js";

function treeValue(nodes: OutputTreeNode[]): Record<string, unknown> {
  return Object.fromEntries(
    nodes.map((node) => [
      node.name,
      node.children ? treeValue(node.children) : node.type,
    ]),
  );
}

async function authoredOutput(
  runtime: { client: RuntimeClient; queryClient: QueryClient },
  block: BlockRef,
  config: unknown,
) {
  try {
    const tree = await runtime.queryClient.fetchQuery(
      outputTreeQuery(runtime.client, block, config),
    );
    if (tree.nodes.length > 0) return treeValue(tree.nodes);
    // Schema with no sub-paths = the output itself is the value.
    return tree.source === "none" ? "no declared schema" : "value";
  } catch {
    return {};
  }
}

const LAST_RUN_POLL_MS = 10_000;

function LastRunFact(props: { workflowId: string }) {
  const runs = useRunsQuery(
    { workflowId: props.workflowId, limit: LATEST_RUN_WINDOW },
    { pollMs: LAST_RUN_POLL_MS },
  );
  if (runs.status === "pending") return null;
  const run = runs.data?.at(0) ?? null;
  if (run === null) {
    return <span className="text-xs text-muted-foreground">Not run yet</span>;
  }
  const tone = toneOf(RUN_TONE, run.status);
  return (
    <span
      className="flex items-center gap-1.5 text-xs text-muted-foreground"
      title={formatAbsolute(run.startedAt)}
    >
      Last run
      <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} />
      <span className={TONE_TEXT[tone]}>{formatWhen(run.startedAt)}</span>
      <span className="tabular-nums">
        {formatDuration(run.startedAt, run.endedAt)}
      </span>
    </span>
  );
}

function WorkflowEditor() {
  const { client, queryClient } = useRuntime();
  const actions = useRuntimeActions();
  const { model, callbacks } = useWorkflowModel();
  const [document] = useSelectedWorkflowDocument();
  const workflowId = document.header.id;

  // The runtime lists every connection it holds; offer only this drive's.
  // Null outside a drive, where there's nothing to scope to.
  const driveNodes = useFileNodesInSelectedDrive();
  // Lets the runtime wait for a workflow that hasn't synced to it yet.
  const driveId = useSelectedDriveId() ?? undefined;
  const driveConnections = driveNodes
    ? driveNodes
        .filter((node) => node.documentType === "powerhouse/connection")
        .map((node) => node.id)
        .join(",")
    : null;

  const designTime = useMemo<DesignTimeService>(
    () => ({
      workflowId,
      getBlockForm: (block) => client.getBlockForm(block),
      loadOptions: (...args) => client.loadBlockOptions(...args),
      testTrigger: () => client.testTrigger(workflowId, driveId),
      testStep: (stepId) => client.testStep(workflowId, stepId, driveId),
      webhookEndpoint: () => client.fetchWebhookEndpoint(workflowId, driveId),
      connectionScope: driveConnections ?? undefined,
      listConnections: () =>
        client.fetchConnections().then((connections) => {
          if (driveConnections === null) return connections;
          const inDrive = new Set(driveConnections.split(",").filter(Boolean));
          return connections.filter((connection) => inDrive.has(connection.id));
        }),
      latestRun: () =>
        client
          .fetchRuns({
            workflowId,
            limit: LATEST_RUN_WINDOW,
            excludeTriggerKinds: [TEST_TRIGGER_KIND],
          })
          .then((runs) => realRuns(runs).at(0) ?? null),
      fetchRun: (runId) => client.fetchRun(runId),
      blockResolutions: () => client.blockResolutions(workflowId),
      secrets: {
        save: ({ ref, value, label }) =>
          ref
            ? actions.rotateSecret(ref, value)
            : actions.createSecret(value, label),
        stat: (ref) => client.fetchSecretStat(ref),
      },
    }),
    [client, actions, workflowId, driveId, driveConnections],
  );

  // Scope for the {} picker: last test samples first, then journaled outputs
  // from the latest run, then authored shapes (declared types as leaves).
  const scopeSource = useMemo<ExpressionScopeSource>(
    () => ({
      load: async ({ stepId }) => {
        // Trigger config fields run before any step; nothing to reference.
        if (!stepId) return EMPTY_SCOPE;
        const latestRun = await queryClient
          .fetchQuery(
            runsQuery(client, { workflowId, limit: LATEST_RUN_WINDOW }),
          )
          .then(
            (runs) => runs[0],
            () => undefined,
          );
        return buildExpressionScope({
          model,
          stepId,
          latestRun,
          authoredOutput: (block, config) =>
            authoredOutput({ client, queryClient }, block, config),
          testOutput: async (blockId) => {
            const block =
              model.trigger?.id === blockId
                ? model.trigger
                : model.steps.find((step) => step.id === blockId);
            const tree = await queryClient.fetchQuery(
              stepOutputTreeQuery(
                client,
                workflowId,
                blockId,
                block?.lastTest?.testedAt ?? null,
              ),
            );
            return tree.source === "test" && tree.testedAt
              ? { value: tree.sample, testedAt: tree.testedAt }
              : undefined;
          },
        });
      },
    }),
    [client, queryClient, model, workflowId],
  );

  return (
    <DesignTimeProvider
      service={designTime}
      queryClient={queryClient}
      scope={client.url}
    >
      <ExpressionScopeSourceProvider value={scopeSource}>
        <div className="flex h-full min-h-0 flex-col bg-background">
          <WorkflowEditorApp
            model={model}
            callbacks={callbacks}
            leading={<BackButton />}
            trailing={
              <>
                <LastRunFact workflowId={workflowId} />
                <UndoRedo documentId={workflowId} policy={WORKFLOW_UNDO} />
              </>
            }
          />
        </div>
      </ExpressionScopeSourceProvider>
    </DesignTimeProvider>
  );
}

// A drive node can point at a document the reactor cannot serve; the document
// hooks throw for it. The boundary keeps that failure inside the editor pane.
export default function Editor() {
  const documentId = useSelectedDocumentId();
  return (
    <DocumentErrorBoundary documentId={documentId}>
      <WorkflowRuntimeProvider>
        <WorkflowEditor />
      </WorkflowRuntimeProvider>
    </DocumentErrorBoundary>
  );
}
