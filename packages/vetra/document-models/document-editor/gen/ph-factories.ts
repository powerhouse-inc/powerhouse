/**
 * Factory methods for creating DocumentEditorDocument instances
 */
import type { PHAuthState, PHBaseState, PHDocumentState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model/core";
import type {
  DocumentEditorDocument,
  DocumentEditorGlobalState,
  DocumentEditorLocalState,
  DocumentEditorPHState,
} from "./types.js";
import { createDocument } from "./utils.js";

export function defaultGlobalState(): DocumentEditorGlobalState {
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
  state?: Partial<DocumentEditorGlobalState>,
): DocumentEditorGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  } as DocumentEditorGlobalState;
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
  globalState?: Partial<DocumentEditorGlobalState>,
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
    global?: Partial<DocumentEditorGlobalState>;
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
