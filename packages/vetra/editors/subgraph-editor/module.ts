/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { EditorModule } from "document-model";
import type {
  SubgraphModuleAction,
  SubgraphModuleDocument,
} from "../../document-models/subgraph-module/index.js";
import { lazy } from "react";

/** Document editor module for the "powerhouse/subgraph" document type */
export const SubgraphModuleEditor: EditorModule<
  SubgraphModuleDocument,
  SubgraphModuleAction
> = {
  Component: lazy(() => import("./editor.js")),
  documentTypes: ["powerhouse/subgraph"],
  config: {
    id: "subgraph-module-editor",
    name: "Subgraph Module Editor",
  },
};
