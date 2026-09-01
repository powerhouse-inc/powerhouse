import "@xyflow/react/dist/style.css";
import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import { useWorkflowModel } from "./document/useWorkflowModel.js";
import { WorkflowEditorApp } from "./ui/WorkflowEditorApp.js";

export default function Editor() {
  const { model, callbacks } = useWorkflowModel();

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <DocumentToolbar />
      <WorkflowEditorApp model={model} callbacks={callbacks} />
    </div>
  );
}
