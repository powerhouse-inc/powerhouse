/**
 * Factory methods for creating TodoDocument instances
 */
import type { PHAuthState, PHDocumentState, PHBaseState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model/core";
import type {
  TodoDocument,
  TodoLocalState,
  TodoGlobalState,
  TodoPHState,
} from "./types.js";
import { createDocument } from "./utils.js";

export function defaultGlobalState(): TodoGlobalState {
  return { todos: [], title: "" };
}

export function defaultLocalState(): TodoLocalState {
  return {};
}

export function defaultPHState(): TodoPHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<TodoGlobalState>,
): TodoGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  } as TodoGlobalState;
}

export function createLocalState(
  state?: Partial<TodoLocalState>,
): TodoLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as TodoLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<TodoGlobalState>,
  localState?: Partial<TodoLocalState>,
): TodoPHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a TodoDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createTodoDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<TodoGlobalState>;
    local?: Partial<TodoLocalState>;
  }>,
): TodoDocument {
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
