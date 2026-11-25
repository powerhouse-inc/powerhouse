/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 * Factory methods for creating BrandSheetDocument instances
 */
import type { PHAuthState, PHBaseState, PHDocumentState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model";
import type {
  BrandSheetDocument,
  BrandSheetGlobalState,
  BrandSheetLocalState,
  BrandSheetPHState,
} from "./types.js";
import { utils } from "./utils.js";

export function defaultGlobalState(): BrandSheetGlobalState {
  return {
    name: null,
    maxim: null,
    concept: null,
    logos: [],
    colors: [],
    typography: [],
    voice: null,
    imagery: null,
    agentFeedback: {
      readyForFeedback: false,
      suggestions: [],
    },
  };
}

export function defaultLocalState(): BrandSheetLocalState {
  return {};
}

export function defaultPHState(): BrandSheetPHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<BrandSheetGlobalState>,
): BrandSheetGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  };
}

export function createLocalState(
  state?: Partial<BrandSheetLocalState>,
): BrandSheetLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as BrandSheetLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<BrandSheetGlobalState>,
  localState?: Partial<BrandSheetLocalState>,
): BrandSheetPHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a BrandSheetDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createBrandSheetDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<BrandSheetGlobalState>;
    local?: Partial<BrandSheetLocalState>;
  }>,
): BrandSheetDocument {
  const document = utils.createDocument(
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
