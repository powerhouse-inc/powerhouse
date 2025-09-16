/**
 * Factory methods for creating AppModuleDocument instances
 */
import type { PHAuthState, PHDocumentState, PHBaseState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model";
import type {
  AppModuleDocument,
  AppModuleLocalState,
  AppModuleGlobalState,
  AppModulePHState,
} from "./types.js";
import { createDocument } from "./utils.js";

export function defaultGlobalState(): AppModuleGlobalState {
  return {
    name: "",
    status: "DRAFT",
    documentTypes: [{ id: "all-documents", documentType: "*" }],
    dragAndDrop: {
      enabled: true,
    },
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
  state?: Partial<AppModuleGlobalState>,
): AppModuleGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  } as AppModuleGlobalState;
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
  globalState?: Partial<AppModuleGlobalState>,
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
    global?: Partial<AppModuleGlobalState>;
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
