/**
 * Factory methods for creating SubgraphModuleDocument instances
 */
import type { PHAuthState, PHBaseState, PHDocumentState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model/core";
import type {
  SubgraphModuleDocument,
  SubgraphModuleGlobalState,
  SubgraphModuleLocalState,
  SubgraphModulePHState,
} from "./types.js";
import { createDocument } from "./utils.js";

export function defaultGlobalState(): SubgraphModuleGlobalState {
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
  state?: Partial<SubgraphModuleGlobalState>,
): SubgraphModuleGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  } as SubgraphModuleGlobalState;
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
  globalState?: Partial<SubgraphModuleGlobalState>,
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
    global?: Partial<SubgraphModuleGlobalState>;
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
