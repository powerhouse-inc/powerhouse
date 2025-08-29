/**
 * Factory methods for creating DocumentDriveDocument instances
 */

import type { PHAuthState, PHBaseState, PHDocumentState } from "document-model";
import { defaultBaseState, testCreateBaseState } from "document-model";
import type {
  DocumentDriveDocument,
  DocumentDriveLocalState,
  DocumentDriveState,
} from "./gen/types.js";
import { createDocument } from "./gen/utils.js";
import type { DocumentDrivePHState } from "./types.js";

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
    ...state,
  };
}

export function createLocalState(
  state?: Partial<DocumentDriveLocalState>,
): DocumentDriveLocalState {
  return {
    ...defaultLocalState(),
    ...state,
  };
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<DocumentDriveState>,
  localState?: Partial<DocumentDriveLocalState>,
): DocumentDrivePHState {
  return {
    ...testCreateBaseState(baseState),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a DocumentDriveDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createDriveDocument(
  state: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<DocumentDriveState>;
    local?: Partial<DocumentDriveLocalState>;
  }>,
): DocumentDriveDocument {
  const document = createDocument(
    createState(
      testCreateBaseState(state.auth, state.document),
      state.global,
      state.local,
    ),
  );

  return document;
}
