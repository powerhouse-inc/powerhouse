/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { DocumentModelUtils, PHBaseState, Reducer } from "document-model";
import {
  baseCreateDocument,
  baseLoadFromInputVersioned,
  baseSaveToFileHandle,
  createBaseState,
} from "document-model";
import { inventoryItemUpgradeManifest } from "../../upgrades/upgrade-manifest.js";
import {
  assertIsInventoryItemDocument,
  assertIsInventoryItemState,
  isInventoryItemDocument,
  isInventoryItemState,
} from "./document-schema.js";
import { inventoryItemDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type {
  InventoryItemGlobalState,
  InventoryItemLocalState,
  InventoryItemPHState,
} from "./types.js";

export const initialGlobalState: InventoryItemGlobalState = {
  name: null,
  sku: null,
  quantity: 0,
  location: null,
  history: [],
};
export const initialLocalState: InventoryItemLocalState = {};

export const utils: DocumentModelUtils<InventoryItemPHState> = {
  fileExtension: "inv",
  createState(state) {
    return {
      ...createBaseState(state?.auth, { version: 1, ...state?.document }),
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createDocument(state) {
    return baseCreateDocument(
      utils.createState,
      state,
      inventoryItemDocumentType,
    );
  },
  saveToFileHandle(document, input) {
    return baseSaveToFileHandle(document, input);
  },
  loadFromInput(input) {
    return baseLoadFromInputVersioned(input, {
      reducers: { 1: reducer as unknown as Reducer<PHBaseState> },
      upgradeManifest: inventoryItemUpgradeManifest,
    });
  },
  isStateOfType(state) {
    return isInventoryItemState(state);
  },
  assertIsStateOfType(state) {
    return assertIsInventoryItemState(state);
  },
  isDocumentOfType(document) {
    return isInventoryItemDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsInventoryItemDocument(document);
  },
};
