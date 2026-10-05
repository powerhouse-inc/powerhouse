/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 * Factory methods for creating ConnectionDocument instances
 */
import type { PHAuthState, PHBaseState, PHDocumentState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model";
import type {
  ConnectionDocument,
  ConnectionGlobalState,
  ConnectionLocalState,
  ConnectionPHState,
} from "./types.js";
import { utils } from "./utils.js";

export function defaultGlobalState(): ConnectionGlobalState {
  return {
    name: "",
    connectorId: "",
    authType: "NONE",
    config: {},
    secretRefs: [],
    status: "UNCONFIGURED",
    lastCheckedAt: null,
    lastError: null,
    accountLabel: null,
  };
}

export function defaultLocalState(): ConnectionLocalState {
  return {};
}

export function defaultPHState(): ConnectionPHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<ConnectionGlobalState>,
): ConnectionGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  };
}

export function createLocalState(
  state?: Partial<ConnectionLocalState>,
): ConnectionLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as ConnectionLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<ConnectionGlobalState>,
  localState?: Partial<ConnectionLocalState>,
): ConnectionPHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a ConnectionDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createConnectionDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<ConnectionGlobalState>;
    local?: Partial<ConnectionLocalState>;
  }>,
): ConnectionDocument {
  const document = utils.createDocument(
    createState(
      createBaseState(state?.auth, { version: 1, ...state?.document }),
      state?.global,
      state?.local,
    ),
  );

  return document;
}
