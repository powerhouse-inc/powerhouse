/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 * Factory methods for creating InventoryItemDocument instances
 */
import type { PHAuthState, PHBaseState, PHDocumentState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model";
import type {
  InventoryItemDocument,
  InventoryItemGlobalState,
  InventoryItemLocalState,
  InventoryItemPHState,
} from "./types.js";
import { utils } from "./utils.js";

export function defaultGlobalState(): InventoryItemGlobalState {
  return { name: null, quantity: 0, location: null };
}

export function defaultLocalState(): InventoryItemLocalState {
  return {};
}

export function defaultPHState(): InventoryItemPHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<InventoryItemGlobalState>,
): InventoryItemGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  };
}

export function createLocalState(
  state?: Partial<InventoryItemLocalState>,
): InventoryItemLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as InventoryItemLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<InventoryItemGlobalState>,
  localState?: Partial<InventoryItemLocalState>,
): InventoryItemPHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a InventoryItemDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createInventoryItemDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<InventoryItemGlobalState>;
    local?: Partial<InventoryItemLocalState>;
  }>,
): InventoryItemDocument {
  const document = utils.createDocument(
    createState(
      createBaseState(state?.auth, { version: 1, ...state?.document }),
      state?.global,
      state?.local,
    ),
  );

  return document;
}
