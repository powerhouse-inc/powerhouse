/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { EditorModule } from "document-model";
import type {
  AppModuleAction,
  AppModuleDocument,
} from "../../document-models/app-module/index.js";
import { lazy } from "react";

/** Document editor module for the "powerhouse/app" document type */
export const AppEditor: EditorModule<AppModuleDocument, AppModuleAction> = {
  Component: lazy(() => import("./editor.js")),
  documentTypes: ["powerhouse/app"],
  config: {
    id: "app-editor",
    name: "AppEditor",
  },
};
