import "@xyflow/react/dist/style.css";
import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import { useWorkflowModel } from "./document/useWorkflowModel.js";
import { EditorSwitch } from "./EditorSwitch.js";
import {
  fetchPieceActions,
  fetchPieceCatalog,
  getBlockForm,
  loadBlockOptions,
} from "./runtime-api.js";
import type { DesignTimeService } from "./ui/forms.js";
import { registerPieceSource } from "./ui/piece-source.js";
import { useSyncWorkflowRuntimeUrl } from "./use-runtime-url.js";
import { WorkflowEditorApp } from "./ui/WorkflowEditorApp.js";

const designTime: DesignTimeService = {
  getBlockForm,
  loadOptions: loadBlockOptions,
};

registerPieceSource({
  loadCatalog: fetchPieceCatalog,
  loadActions: fetchPieceActions,
});

export default function Editor() {
  useSyncWorkflowRuntimeUrl();
  const { model, callbacks } = useWorkflowModel();

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
