/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { PHBaseState, PHDocument } from "document-model";
import type { InventoryItemAction } from "./actions.js";
import type { InventoryItemState as InventoryItemGlobalState } from "./schema/types.js";

type InventoryItemLocalState = Record<PropertyKey, never>;

type InventoryItemPHState = PHBaseState & {
  global: InventoryItemGlobalState;
  local: InventoryItemLocalState;
};
type InventoryItemDocument = PHDocument<InventoryItemPHState>;

export * from "./schema/types.js";

export type {
  InventoryItemAction,
  InventoryItemDocument,
  InventoryItemGlobalState,
  InventoryItemLocalState,
  InventoryItemPHState,
};
