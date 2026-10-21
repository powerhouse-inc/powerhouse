/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { EditorModule } from "document-model";
import type { TodoAction, TodoDocument } from "document-models/todo";
import { lazy } from "react";

/** Document editor module for the "["powerhouse/document-drive"]" document type */
export const TodoEditor: EditorModule<TodoDocument, TodoAction> = {
  Component: lazy(() => import("./editor.js")),
  documentTypes: ["test/todo"],
  config: {
    id: "todo-editor",
    name: "TodoEditor",
  },
};
