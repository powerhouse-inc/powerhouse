/**
 * Factory methods for creating ProcessorModuleDocument instances
 */

import {
  createBaseState,
  defaultBaseState,
  type PHAuthState,
  type PHDocumentState,
  type PHBaseState,
} from "document-model";
import type {
  ProcessorModuleDocument,
  ProcessorModuleLocalState,
  ProcessorModuleState,
} from "./types.js";
import { createDocument } from "./utils.js";

export type ProcessorModulePHState = PHBaseState & {
  global: ProcessorModuleState;
  local: ProcessorModuleLocalState;
};

export function defaultGlobalState(): ProcessorModuleState {
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
  state?: Partial<ProcessorModuleState>,
): ProcessorModuleState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  } as ProcessorModuleState;
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
  globalState?: Partial<ProcessorModuleState>,
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
    global?: Partial<ProcessorModuleState>;
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
