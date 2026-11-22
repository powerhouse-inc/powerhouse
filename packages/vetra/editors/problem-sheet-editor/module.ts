/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { EditorModule } from "document-model";
import { lazy } from "react";

/** Document editor module for the "powerhouse/problem-sheet" document type */
export const ProblemSheetEditor: EditorModule = {
  Component: lazy(() => import("./editor.js")),
  documentTypes: ["powerhouse/problem-sheet"],
  config: {
    id: "problem-sheet-editor",
    name: "Problem Sheet Editor",
  },
};
