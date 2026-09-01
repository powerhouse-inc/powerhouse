import "@xyflow/react/dist/style.css";
import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import { useWorkflowModel } from "./document/useWorkflowModel.js";
import { getBlockForm, loadBlockOptions } from "./runtime-api.js";
import type { DesignTimeService } from "./ui/forms.js";
import { WorkflowEditorApp } from "./ui/WorkflowEditorApp.js";

const designTime: DesignTimeService = {
  getBlockForm,
  loadOptions: loadBlockOptions,
};

export default function Editor() {
  const { model, callbacks } = useWorkflowModel();

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
