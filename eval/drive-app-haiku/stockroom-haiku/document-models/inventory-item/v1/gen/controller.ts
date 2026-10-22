/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { PHDocumentController } from "document-model";
import { InventoryItem } from "../module.js";
import type { InventoryItemAction, InventoryItemPHState } from "./types.js";

export const InventoryItemController = PHDocumentController.forDocumentModel<
  InventoryItemPHState,
  InventoryItemAction
>(InventoryItem);
