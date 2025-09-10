/**
 * Factory methods for creating SubgraphModuleDocument instances
 */

import {
  createBaseState,
  defaultBaseState,
  type PHAuthState,
  type PHDocumentState,
  type PHBaseState,
} from "document-model";
import type {
  SubgraphModuleDocument,
  SubgraphModuleLocalState,
  SubgraphModuleState,
} from "./types.js";
import { createDocument } from "./utils.js";

export type SubgraphModulePHState = PHBaseState & {
  global: SubgraphModuleState;
  local: SubgraphModuleLocalState;
};

export function defaultGlobalState(): SubgraphModuleState {
  return {
    name: "",
    status: "DRAFT",
  };
}

export function defaultLocalState(): SubgraphModuleLocalState {
  return {};
}

export function defaultPHState(): SubgraphModulePHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<SubgraphModuleState>,
): SubgraphModuleState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  } as SubgraphModuleState;
}

export function createLocalState(
  state?: Partial<SubgraphModuleLocalState>,
): SubgraphModuleLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as SubgraphModuleLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<SubgraphModuleState>,
  localState?: Partial<SubgraphModuleLocalState>,
): SubgraphModulePHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a SubgraphModuleDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createSubgraphModuleDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<SubgraphModuleState>;
    local?: Partial<SubgraphModuleLocalState>;
  }>,
): SubgraphModuleDocument {
  const document = createDocument(
    state
      ? createState(
          createBaseState(state.auth, state.document),
          state.global,
          state.local,
        )
      : undefined,
  );

  return document;
}
