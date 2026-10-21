/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { EditorModule } from "document-model";
import type {
  VetraPackageAction,
  VetraPackageDocument,
} from "../../document-models/vetra-package/index.js";
import { lazy } from "react";

/** Document editor module for the "powerhouse/package" document type */
export const VetraPackageEditor: EditorModule<
  VetraPackageDocument,
  VetraPackageAction
> = {
  Component: lazy(() => import("./editor.js")),
  documentTypes: ["powerhouse/package"],
  config: {
    id: "vetra-package-editor",
    name: "Vetra Package Editor",
  },
};
