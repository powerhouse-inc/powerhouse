/**
 * Factory methods for creating ToDoDocumentDocument instances
 */
import type { PHAuthState, PHDocumentState, PHBaseState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model/core";
import type {
  ToDoDocumentDocument,
  ToDoDocumentLocalState,
  ToDoDocumentGlobalState,
  ToDoDocumentPHState,
} from "./types.js";
import { createDocument } from "./utils.js";

export function defaultGlobalState(): ToDoDocumentGlobalState {
  return {
    items: [],
    stats: {
      total: 0,
      checked: 0,
      unchecked: 0,
    },
  };
}

export function defaultLocalState(): ToDoDocumentLocalState {
  return {};
}

export function defaultPHState(): ToDoDocumentPHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<ToDoDocumentGlobalState>,
): ToDoDocumentGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  } as ToDoDocumentGlobalState;
}

export function createLocalState(
  state?: Partial<ToDoDocumentLocalState>,
): ToDoDocumentLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as ToDoDocumentLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<ToDoDocumentGlobalState>,
  localState?: Partial<ToDoDocumentLocalState>,
): ToDoDocumentPHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a ToDoDocumentDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createToDoDocumentDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<ToDoDocumentGlobalState>;
    local?: Partial<ToDoDocumentLocalState>;
  }>,
): ToDoDocumentDocument {
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
