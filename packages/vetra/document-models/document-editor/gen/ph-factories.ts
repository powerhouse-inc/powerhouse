/**
 * Factory methods for creating DocumentEditorDocument instances
 */

import {
  createBaseState,
  defaultBaseState,
  type PHAuthState,
  type PHDocumentState,
  type PHBaseState,
} from "document-model";
import type {
  DocumentEditorDocument,
  DocumentEditorLocalState,
  DocumentEditorState,
} from "./types.js";
import { createDocument } from "./utils.js";

export type DocumentEditorPHState = PHBaseState & {
  global: DocumentEditorState;
  local: DocumentEditorLocalState;
};

export function defaultGlobalState(): DocumentEditorState {
  return {
    name: "",
    documentTypes: [],
    status: "DRAFT",
  };
}

export function defaultLocalState(): DocumentEditorLocalState {
  return {};
}

export function defaultPHState(): DocumentEditorPHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<DocumentEditorState>,
): DocumentEditorState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  } as DocumentEditorState;
}

export function createLocalState(
  state?: Partial<DocumentEditorLocalState>,
): DocumentEditorLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as DocumentEditorLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<DocumentEditorState>,
  localState?: Partial<DocumentEditorLocalState>,
): DocumentEditorPHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a DocumentEditorDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createDocumentEditorDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<DocumentEditorState>;
    local?: Partial<DocumentEditorLocalState>;
  }>,
): DocumentEditorDocument {
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
