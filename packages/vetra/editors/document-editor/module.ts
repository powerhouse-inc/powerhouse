/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { EditorModule } from "document-model";
import type {
  DocumentEditorAction,
  DocumentEditorDocument,
} from "../../document-models/document-editor/index.js";
import { lazy } from "react";

/** Document editor module for the "powerhouse/document-editor" document type */
export const DocumentEditorEditor: EditorModule<
  DocumentEditorDocument,
  DocumentEditorAction
> = {
  Component: lazy(() => import("./editor.js")),
  documentTypes: ["powerhouse/document-editor"],
  config: {
    id: "document-editor-editor",
    name: "Document Editor Editor",
  },
};
