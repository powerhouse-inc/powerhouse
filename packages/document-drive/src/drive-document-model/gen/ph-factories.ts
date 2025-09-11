/**
 * Factory methods for creating DocumentDriveDocument instances
 */

import {
  createBaseState,
  defaultBaseState,
  type PHAuthState,
  type PHBaseState,
  type PHDocumentState,
} from "document-model";
import type {
  DocumentDriveDocument,
  DocumentDriveLocalState,
  DocumentDriveState,
} from "./types.js";
import { createDocument } from "./utils.js";

export function defaultGlobalState(): DocumentDriveState {
  return {
    icon: null,
    name: "",
    nodes: [],
  };
}

export function defaultLocalState(): DocumentDriveLocalState {
  return {
    availableOffline: false,
    listeners: [],
    sharingType: null,
    triggers: [],
  };
}

export function defaultPHState(): DocumentDrivePHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<DocumentDriveState>,
): DocumentDriveState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  } as DocumentDriveState;
}

export function createLocalState(
  state?: Partial<DocumentDriveLocalState>,
): DocumentDriveLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as DocumentDriveLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<DocumentDriveState>,
  localState?: Partial<DocumentDriveLocalState>,
): DocumentDrivePHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

export type DocumentDrivePHState = PHBaseState & {
  global: DocumentDriveState;
  local: DocumentDriveLocalState;
};

/**
 * Creates a DocumentDriveDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createDocumentDriveDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<DocumentDriveState>;
    local?: Partial<DocumentDriveLocalState>;
  }>,
): DocumentDriveDocument {
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
