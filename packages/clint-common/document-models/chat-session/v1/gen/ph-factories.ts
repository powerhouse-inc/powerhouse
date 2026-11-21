/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 * Factory methods for creating ChatSessionDocument instances
 */
import type { PHAuthState, PHBaseState, PHDocumentState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model";
import type {
  ChatSessionDocument,
  ChatSessionGlobalState,
  ChatSessionLocalState,
  ChatSessionPHState,
} from "./types.js";
import { utils } from "./utils.js";

export function defaultGlobalState(): ChatSessionGlobalState {
  return {
    threadId: null,
    resourceId: null,
    agent: null,
    status: "ACTIVE",
    startedAt: null,
    endedAt: null,
    messages: [],
    usage: null,
    interruptRequested: false,
    retryRequestedFor: null,
    retryRequestedAt: null,
  };
}

export function defaultLocalState(): ChatSessionLocalState {
  return {};
}

export function defaultPHState(): ChatSessionPHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<ChatSessionGlobalState>,
): ChatSessionGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  };
}

export function createLocalState(
  state?: Partial<ChatSessionLocalState>,
): ChatSessionLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as ChatSessionLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<ChatSessionGlobalState>,
  localState?: Partial<ChatSessionLocalState>,
): ChatSessionPHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a ChatSessionDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createChatSessionDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<ChatSessionGlobalState>;
    local?: Partial<ChatSessionLocalState>;
  }>,
): ChatSessionDocument {
  const document = utils.createDocument(
    createState(
      createBaseState(state?.auth, { version: 1, ...state?.document }),
      state?.global,
      state?.local,
    ),
  );

  return document;
}
