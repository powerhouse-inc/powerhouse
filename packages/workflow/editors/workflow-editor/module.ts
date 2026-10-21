/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { EditorModule } from "document-model";
import type {
  WorkflowAction,
  WorkflowDocument,
} from "document-models/workflow";
import { lazy } from "react";

/** Document editor module for the "powerhouse/workflow" document type */
export const WorkflowEditor: EditorModule<WorkflowDocument, WorkflowAction> = {
  Component: lazy(() => import("./editor.js")),
  documentTypes: ["powerhouse/workflow"],
  config: {
    id: "workflow-editor",
    name: "Workflow Editor",
  },
};
