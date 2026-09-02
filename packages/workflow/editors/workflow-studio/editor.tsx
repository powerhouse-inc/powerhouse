/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { useSetPHAppConfig } from "@powerhousedao/reactor-browser";
import type { EditorProps } from "document-model";
import { useSyncWorkflowRuntimeUrl } from "../workflow-editor/use-runtime-url.js";
import { WorkflowStudio } from "./components/WorkflowStudio.js";
import { editorConfig } from "./config.js";

/** Editor component for the app */
export default function Editor(props: EditorProps) {
  useSetPHAppConfig(editorConfig);
  useSyncWorkflowRuntimeUrl();
  return (
    <div className="h-full min-h-0 bg-background">
      <WorkflowStudio>{props.children}</WorkflowStudio>
    </div>
  );
}
