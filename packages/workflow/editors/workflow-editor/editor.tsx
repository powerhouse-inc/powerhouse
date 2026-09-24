import "@xyflow/react/dist/style.css";
import "./ui/canvas.css";
import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import { useSelectedDocumentId } from "@powerhousedao/reactor-browser";
import { useSelectedWorkflowDocument } from "document-models/workflow";
import { useEffect, useMemo } from "react";
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
} from "./runtime-api.js";
import { buildExpressionScope, EMPTY_SCOPE } from "./ui/expression-scope.js";
import { registerExpressionScopeSource } from "./ui/ExpressionPicker.js";
import type { DesignTimeService } from "./ui/forms.js";
import { DocumentErrorBoundary } from "../shared/DocumentErrorBoundary.js";
import { useSyncWorkflowRuntimeUrl } from "./use-runtime-url.js";
import { WorkflowEditorApp } from "./ui/WorkflowEditorApp.js";

function WorkflowEditor() {
  useSyncWorkflowRuntimeUrl();
  const { model, callbacks } = useWorkflowModel();
  const [document] = useSelectedWorkflowDocument();
  const workflowId = document.header.id;

  const designTime = useMemo<DesignTimeService>(
    () => ({
      getBlockForm,
      loadOptions: loadBlockOptions,
      testTrigger: () => testTrigger(workflowId),
      webhookEndpoint: () => fetchWebhookEndpoint(workflowId),
      listConnections: fetchConnections,
      refreshConnections: invalidateConnections,
      latestRun: () =>
        fetchRuns({ workflowId, limit: 1 }).then((runs) => runs.at(0) ?? null),
      secrets: {
        save: ({ ref, value, label }) =>
          ref ? rotateSecret(ref, value) : createSecret(value, label),
        stat: fetchSecretStat,
      },
    }),
    [workflowId],
  );

  // Scope for the {} picker: journaled outputs from the latest run where
  // available, authored shapes (declared types as leaves) otherwise.
  useEffect(() => {
    const treeValue = (nodes: OutputTreeNode[]): Record<string, unknown> =>
      Object.fromEntries(
        nodes.map((node) => [
          node.name,
          node.children ? treeValue(node.children) : node.type,
        ]),
      );
    const authoredOutput = async (blockType: string, config: unknown) => {
      try {
        const tree = await fetchBlockOutputTree(blockType, config);
        if (tree.nodes.length > 0) return treeValue(tree.nodes);
        // Schema with no sub-paths = the output itself is the value.
        return tree.source === "none" ? "no declared schema" : "value";
      } catch {
        return {};
      }
    };
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
      <DocumentToolbar />
      <WorkflowEditorApp
        model={model}
        callbacks={callbacks}
        designTime={designTime}
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
