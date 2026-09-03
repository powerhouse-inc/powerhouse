import "@xyflow/react/dist/style.css";
import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import { useSelectedWorkflowDocument } from "document-models/workflow";
import { useEffect, useMemo } from "react";
import { useWorkflowModel } from "./document/useWorkflowModel.js";
import { EditorSwitch } from "./EditorSwitch.js";
import {
  fetchBlockOutputTree,
  fetchConnections,
  fetchPieceActions,
  fetchPieceCatalog,
  fetchPieceTriggers,
  getBlockForm,
  loadBlockOptions,
  testTrigger,
  type OutputTreeNode,
} from "./runtime-api.js";
import { registerExpressionScopeSource } from "./ui/ExpressionPicker.js";
import type { DesignTimeService } from "./ui/forms.js";
import { registerPieceSource } from "./ui/piece-source.js";
import { useSyncWorkflowRuntimeUrl } from "./use-runtime-url.js";
import { WorkflowEditorApp } from "./ui/WorkflowEditorApp.js";

registerPieceSource({
  loadCatalog: fetchPieceCatalog,
  loadActions: fetchPieceActions,
  loadTriggers: fetchPieceTriggers,
});

export default function Editor() {
  useSyncWorkflowRuntimeUrl();
  const { model, callbacks } = useWorkflowModel();
  const [document] = useSelectedWorkflowDocument();
  const workflowId = document.header.id;

  const designTime = useMemo<DesignTimeService>(
    () => ({
      getBlockForm,
      loadOptions: loadBlockOptions,
      testTrigger: () => testTrigger(workflowId),
      listConnections: fetchConnections,
    }),
    [workflowId],
  );

  // Scope for the {} picker, built purely from authored shapes: leaves carry
  // the declared type instead of any run's values.
  useEffect(() => {
    const treeValue = (nodes: OutputTreeNode[]): Record<string, unknown> =>
      Object.fromEntries(
        nodes.map((node) => [
          node.name,
          node.children ? treeValue(node.children) : node.type,
        ]),
      );
    const outputOf = async (blockType: string, config: unknown) => {
      try {
        const tree = await fetchBlockOutputTree(blockType, config);
        if (tree.nodes.length > 0) return treeValue(tree.nodes);
        return tree.source === "none" ? "no declared schema" : {};
      } catch {
        return {};
      }
    };
    registerExpressionScopeSource({
      load: async () => {
        const steps: Record<string, unknown> = {};
        await Promise.all(
          model.steps.map(async (step) => {
            steps[step.key] = { output: await outputOf(step.blockType, step.config) };
          }),
        );
        const payload = model.trigger
          ? await outputOf(model.trigger.blockType, model.trigger.config)
          : {};
        return { trigger: { payload }, steps };
      },
    });
  }, [model]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <DocumentToolbar />
      <WorkflowEditorApp
        model={model}
        callbacks={callbacks}
        designTime={designTime}
        headerExtra={<EditorSwitch active="workflow-editor" />}
      />
    </div>
  );
}
