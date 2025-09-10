/**
 * Factory methods for creating AppModuleDocument instances
 */

import {
  createBaseState,
  defaultBaseState,
  type PHAuthState,
  type PHDocumentState,
  type PHBaseState,
} from "document-model";
import type {
  AppModuleDocument,
  AppModuleLocalState,
  AppModuleState,
} from "./types.js";
import { createDocument } from "./utils.js";

export type AppModulePHState = PHBaseState & {
  global: AppModuleState;
  local: AppModuleLocalState;
};

export function defaultGlobalState(): AppModuleState {
  return {
    name: "",
    status: "DRAFT",
  };
}

export function defaultLocalState(): AppModuleLocalState {
  return {};
}

export function defaultPHState(): AppModulePHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<AppModuleState>,
): AppModuleState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  } as AppModuleState;
}

export function createLocalState(
  state?: Partial<AppModuleLocalState>,
): AppModuleLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as AppModuleLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<AppModuleState>,
  localState?: Partial<AppModuleLocalState>,
): AppModulePHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a AppModuleDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createAppModuleDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<AppModuleState>;
    local?: Partial<AppModuleLocalState>;
  }>,
): AppModuleDocument {
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
