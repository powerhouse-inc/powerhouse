import "@xyflow/react/dist/style.css";
import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import { useSelectedWorkflowDocument } from "document-models/workflow";
import { useEffect, useMemo } from "react";
import { useWorkflowModel } from "./document/useWorkflowModel.js";
import { EditorSwitch } from "./EditorSwitch.js";
import {
  fetchPieceActions,
  fetchPieceCatalog,
  fetchPieceTriggers,
  fetchRuns,
  getBlockForm,
  loadBlockOptions,
  testTrigger,
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
    }),
    [workflowId],
  );

  // Sample scope for the {} picker: real values from the latest run,
  // placeholder outputs for steps that haven't run yet.
  const stepKeys = model.steps.map((step) => step.key).join(",");
  useEffect(() => {
    registerExpressionScopeSource({
      load: async () => {
        const steps: Record<string, unknown> = {};
        for (const key of stepKeys.split(",").filter(Boolean)) {
          steps[key] = { output: {} };
        }
        let triggerPayload: unknown = {};
        try {
          const latest = (await fetchRuns(workflowId, 1)).at(0);
          if (latest) {
            triggerPayload = latest.triggerPayload ?? {};
            for (const step of latest.steps) {
              steps[step.stepKey] = { output: step.output };
            }
          }
        } catch {
          // No runtime reachable: offer the static skeleton.
        }
        return { trigger: { payload: triggerPayload }, steps };
      },
    });
  }, [workflowId, stepKeys]);

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
