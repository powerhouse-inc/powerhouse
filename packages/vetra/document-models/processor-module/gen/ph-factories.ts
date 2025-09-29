/**
 * Factory methods for creating ProcessorModuleDocument instances
 */
import type { PHAuthState, PHDocumentState, PHBaseState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model/core";
import type {
  ProcessorModuleDocument,
  ProcessorModuleLocalState,
  ProcessorModuleGlobalState,
  ProcessorModulePHState,
} from "./types.js";
import { createDocument } from "./utils.js";

export function defaultGlobalState(): ProcessorModuleGlobalState {
  return {
    name: "",
    type: "",
    documentTypes: [],
    status: "DRAFT",
  };
}

export function defaultLocalState(): ProcessorModuleLocalState {
  return {};
}

export function defaultPHState(): ProcessorModulePHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<ProcessorModuleGlobalState>,
): ProcessorModuleGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  } as ProcessorModuleGlobalState;
}

export function createLocalState(
  state?: Partial<ProcessorModuleLocalState>,
): ProcessorModuleLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as ProcessorModuleLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<ProcessorModuleGlobalState>,
  localState?: Partial<ProcessorModuleLocalState>,
): ProcessorModulePHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a ProcessorModuleDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createProcessorModuleDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<ProcessorModuleGlobalState>;
    local?: Partial<ProcessorModuleLocalState>;
  }>,
): ProcessorModuleDocument {
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
