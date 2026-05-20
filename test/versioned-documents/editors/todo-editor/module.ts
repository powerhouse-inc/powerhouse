/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { EditorModule } from "document-model";
import { lazy } from "react";

/** Document editor module for the "["powerhouse/document-drive"]" document type */
export const TodoEditor: EditorModule = {
  Component: lazy(() => import("./editor.js")),
  documentTypes: ["test/todo"],
  config: {
    id: "todo-editor",
    name: "TodoEditor",
  },
};
