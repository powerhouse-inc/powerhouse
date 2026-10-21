/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { EditorModule } from "document-model";
import type {
  ConnectionAction,
  ConnectionDocument,
} from "document-models/connection";
import { lazy } from "react";

/** Document editor module for the "powerhouse/connection" document type */
export const ConnectionEditor: EditorModule<
  ConnectionDocument,
  ConnectionAction
> = {
  Component: lazy(() => import("./editor.js")),
  documentTypes: ["powerhouse/connection"],
  config: {
    id: "connection-editor",
    name: "Connection Editor",
  },
};
