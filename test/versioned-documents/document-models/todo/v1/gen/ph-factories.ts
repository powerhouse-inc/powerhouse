/**
 * Factory methods for creating TodoDocument instances
 */
import type {
  PHAuthState,
  PHBaseState,
  PHDocumentState,
} from "@powerhousedao/shared/document-model";
import {
  createBaseState,
  defaultBaseState,
} from "@powerhousedao/shared/document-model";
import type {
  TodoDocument,
  TodoGlobalState,
  TodoLocalState,
  TodoPHState,
} from "./types.js";
import { utils } from "./utils.js";

export function defaultGlobalState(): TodoGlobalState {
  return { todos: [] };
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
  const document = utils.createDocument(
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
