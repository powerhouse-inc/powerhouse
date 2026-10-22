/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { inventoryItemDocumentType } from "./document-type.js";
import { InventoryItemStateSchema } from "./schema/zod.js";
import type { InventoryItemDocument, InventoryItemPHState } from "./types.js";

/** Schema for validating the header object of a InventoryItem document */
export const InventoryItemDocumentHeaderSchema =
  BaseDocumentHeaderSchema.extend({
    documentType: z.literal(inventoryItemDocumentType),
  });

/** Schema for validating the state object of a InventoryItem document */
export const InventoryItemPHStateSchema = BaseDocumentStateSchema.extend({
  global: InventoryItemStateSchema(),
});

export const InventoryItemDocumentSchema = z.object({
  header: InventoryItemDocumentHeaderSchema,
  state: InventoryItemPHStateSchema,
  initialState: InventoryItemPHStateSchema,
});

/** Simple helper function to check if a state object is a InventoryItem document state object */
export function isInventoryItemState(
  state: unknown,
): state is InventoryItemPHState {
  return InventoryItemPHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a InventoryItem document state object */
export function assertIsInventoryItemState(
  state: unknown,
): asserts state is InventoryItemPHState {
  InventoryItemPHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a InventoryItem document */
export function isInventoryItemDocument(
  document: unknown,
): document is InventoryItemDocument {
  return InventoryItemDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a InventoryItem document */
export function assertIsInventoryItemDocument(
  document: unknown,
): asserts document is InventoryItemDocument {
  InventoryItemDocumentSchema.parse(document);
}
