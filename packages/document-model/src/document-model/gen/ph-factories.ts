/**
 * Factory methods for creating DocumentModelDocument instances
 */

import {
  createBaseState,
  defaultBaseState,
  type PHAuthState,
  type PHBaseState,
  type PHDocumentState,
} from "document-model";
import type {
  DocumentModelDocument,
  DocumentModelLocalState,
  DocumentModelState,
} from "./types.js";
import { createDocument } from "./utils.js";

export function defaultGlobalState(): DocumentModelState {
  return {
    ...defaultBaseState(),
    author: {
      name: "",
      website: "",
    },
    description: "",
    extension: "",
    id: "",
    name: "",
    specifications: [],
  };
}

export function defaultLocalState(): DocumentModelLocalState {
  return {};
}

export function defaultPHState(): DocumentModelPHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<DocumentModelState>,
): DocumentModelState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  } as DocumentModelState;
}

export function createLocalState(
  state?: Partial<DocumentModelLocalState>,
): DocumentModelLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as DocumentModelLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<DocumentModelState>,
  localState?: Partial<DocumentModelLocalState>,
): DocumentModelPHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

export type DocumentModelPHState = PHBaseState & {
  global: DocumentModelState;
  local: DocumentModelLocalState;
};

/**
 * Creates a BillingStatementDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createDocumentModelDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<DocumentModelState>;
    local?: Partial<DocumentModelLocalState>;
  }>,
): DocumentModelDocument {
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
