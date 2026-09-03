import "@xyflow/react/dist/style.css";
import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import { useSelectedWorkflowDocument } from "document-models/workflow";
import { useMemo } from "react";
import { useWorkflowModel } from "./document/useWorkflowModel.js";
import { EditorSwitch } from "./EditorSwitch.js";
import {
  fetchPieceActions,
  fetchPieceCatalog,
  fetchPieceTriggers,
  getBlockForm,
  loadBlockOptions,
  testTrigger,
} from "./runtime-api.js";
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
