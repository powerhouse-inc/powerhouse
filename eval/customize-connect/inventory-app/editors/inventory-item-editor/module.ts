/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { EditorModule } from "document-model";
import type {
  InventoryItemAction,
  InventoryItemDocument,
} from "document-models/inventory-item";
import { lazy } from "react";

/** Document editor module for the "acme/inventory-item" document type */
export const InventoryItemEditor: EditorModule<
  InventoryItemDocument,
  InventoryItemAction
> = {
  Component: lazy(() => import("./editor.js")),
  documentTypes: ["acme/inventory-item"],
  config: {
    id: "inventory-item-editor",
    name: "inventory-item-editor",
  },
};
