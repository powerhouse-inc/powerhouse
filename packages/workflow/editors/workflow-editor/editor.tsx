import "@xyflow/react/dist/style.css";
import "./ui/canvas.css";
import {
  useFileNodesInSelectedDrive,
  useSelectedDocumentId,
} from "@powerhousedao/reactor-browser";
import { useSelectedWorkflowDocument } from "document-models/workflow";
import { useEffect, useMemo, useState } from "react";
import { useWorkflowModel } from "./document/useWorkflowModel.js";
import "./runtime-piece-source.js";
import {
  createSecret,
  fetchBlockOutputTree,
  fetchConnections,
  fetchRuns,
  fetchSecretStat,
  fetchWebhookEndpoint,
  getBlockForm,
  invalidateConnections,
  loadBlockOptions,
  rotateSecret,
  testTrigger,
  type OutputTreeNode,
  type RunRecord,
} from "./runtime-api.js";
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
import { registerExpressionScopeSource } from "./ui/ExpressionPicker.js";
import type { DesignTimeService } from "./ui/forms.js";
import { DocumentErrorBoundary } from "../shared/DocumentErrorBoundary.js";
import { useSyncWorkflowRuntimeUrl } from "./use-runtime-url.js";
import { WorkflowEditorApp } from "./ui/WorkflowEditorApp.js";

function treeValue(nodes: OutputTreeNode[]): Record<string, unknown> {
  return Object.fromEntries(
    nodes.map((node) => [
      node.name,
      node.children ? treeValue(node.children) : node.type,
    ]),
  );
}

async function authoredOutput(blockType: string, config: unknown) {
  try {
    const tree = await fetchBlockOutputTree(blockType, config);
    if (tree.nodes.length > 0) return treeValue(tree.nodes);
    // Schema with no sub-paths = the output itself is the value.
    return tree.source === "none" ? "no declared schema" : "value";
  } catch {
    return {};
  }
}

const LAST_RUN_POLL_MS = 10_000;

function LastRunFact(props: { workflowId: string }) {
  const [run, setRun] = useState<RunRecord | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchRuns({ workflowId: props.workflowId, limit: 1 }).then(
        (runs) => {
          if (alive) setRun(runs.at(0) ?? null);
        },
        () => {
          if (alive) setRun(null);
        },
      );
    void load();
    const timer = setInterval(() => void load(), LAST_RUN_POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [props.workflowId]);
  if (run === undefined) return null;
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
  useSyncWorkflowRuntimeUrl();
  const { model, callbacks } = useWorkflowModel();
  const [document] = useSelectedWorkflowDocument();
  const workflowId = document.header.id;

  // The runtime lists every connection it holds; offer only this drive's.
  // Null outside a drive, where there's nothing to scope to.
  const driveNodes = useFileNodesInSelectedDrive();
  const driveConnections = driveNodes
    ? driveNodes
        .filter((node) => node.documentType === "powerhouse/connection")
        .map((node) => node.id)
        .join(",")
    : null;

  const designTime = useMemo<DesignTimeService>(
    () => ({
      getBlockForm,
      loadOptions: loadBlockOptions,
      testTrigger: () => testTrigger(workflowId),
      webhookEndpoint: () => fetchWebhookEndpoint(workflowId),
      listConnections: () =>
        fetchConnections().then((connections) => {
          if (driveConnections === null) return connections;
          const inDrive = new Set(driveConnections.split(",").filter(Boolean));
          return connections.filter((connection) => inDrive.has(connection.id));
        }),
      refreshConnections: invalidateConnections,
      latestRun: () =>
        fetchRuns({ workflowId, limit: 1 }).then((runs) => runs.at(0) ?? null),
      secrets: {
        save: ({ ref, value, label }) =>
          ref ? rotateSecret(ref, value) : createSecret(value, label),
        stat: fetchSecretStat,
      },
    }),
    [workflowId, driveConnections],
  );

  // Scope for the {} picker: journaled outputs from the latest run where
  // available, authored shapes (declared types as leaves) otherwise.
  useEffect(() => {
    registerExpressionScopeSource({
      load: async ({ stepId }) => {
        // Trigger config fields run before any step; nothing to reference.
        if (!stepId) return EMPTY_SCOPE;
        const latestRun = await fetchRuns({ workflowId, limit: 1 }).then(
          (runs) => runs[0],
          () => undefined,
        );
        return buildExpressionScope({
          model,
          stepId,
          latestRun,
          authoredOutput,
        });
      },
    });
  }, [model, workflowId]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <WorkflowEditorApp
        model={model}
        callbacks={callbacks}
        designTime={designTime}
        leading={<BackButton />}
        trailing={
          <>
            <LastRunFact workflowId={workflowId} />
            <UndoRedo documentId={workflowId} />
          </>
        }
      />
    </div>
  );
}

// A drive node can point at a document the reactor cannot serve; the document
// hooks throw for it. The boundary keeps that failure inside the editor pane.
export default function Editor() {
  const documentId = useSelectedDocumentId();
  return (
    <DocumentErrorBoundary documentId={documentId}>
      <WorkflowEditor />
    </DocumentErrorBoundary>
  );
}
