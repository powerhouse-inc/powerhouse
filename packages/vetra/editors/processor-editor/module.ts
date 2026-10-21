/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { EditorModule } from "document-model";
import type {
  ProcessorModuleAction,
  ProcessorModuleDocument,
} from "../../document-models/processor-module/index.js";
import { lazy } from "react";

/** Document editor module for the "powerhouse/processor" document type */
export const ProcessorModuleEditor: EditorModule<
  ProcessorModuleDocument,
  ProcessorModuleAction
> = {
  Component: lazy(() => import("./editor.js")),
  documentTypes: ["powerhouse/processor"],
  config: {
    id: "processor-module-editor",
    name: "Processor Module Editor",
  },
};
