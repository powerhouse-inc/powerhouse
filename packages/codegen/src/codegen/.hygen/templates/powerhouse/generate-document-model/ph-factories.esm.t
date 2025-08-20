---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/ph-factories.ts"
force: true
---
/**
 * Factory methods for creating <%= h.changeCase.pascal(documentType) %>Document instances
 */

import {
  createBaseState,
  defaultBaseState,
  type PHAuthState,
  type PHDocumentState,
  type PHBaseState,
} from "document-model";
import type {
  <%= h.changeCase.pascal(documentType) %>Document,
  <%= h.changeCase.pascal(documentType) %>LocalState,
  <%= h.changeCase.pascal(documentType) %>State,
} from "./gen/types.js";
import { createDocument } from "./gen/utils.js";

export function defaultGlobalState(): <%= h.changeCase.pascal(documentType) %>State {
  return <%- initialGlobalState %>;
}

export function defaultLocalState(): <%= h.changeCase.pascal(documentType) %>LocalState {
  return <%- initialLocalState %>;
}

export function defaultPHState(): <%= h.changeCase.pascal(documentType) %>PHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<<%= h.changeCase.pascal(documentType) %>State>,
): <%= h.changeCase.pascal(documentType) %>State {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  } as <%= h.changeCase.pascal(documentType) %>State;
}

export function createLocalState(
  state?: Partial<<%= h.changeCase.pascal(documentType) %>LocalState>,
): <%= h.changeCase.pascal(documentType) %>LocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as <%= h.changeCase.pascal(documentType) %>LocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<<%= h.changeCase.pascal(documentType) %>State>,
  localState?: Partial<<%= h.changeCase.pascal(documentType) %>LocalState>,
): <%= h.changeCase.pascal(documentType) %>PHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

export type <%= h.changeCase.pascal(documentType) %>PHState = PHBaseState & {
  global: <%= h.changeCase.pascal(documentType) %>State;
  local: <%= h.changeCase.pascal(documentType) %>LocalState;
};

/**
 * Creates a <%= h.changeCase.pascal(documentType) %>Document with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function create<%= h.changeCase.pascal(documentType) %>Document(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<<%= h.changeCase.pascal(documentType) %>State>;
    local?: Partial<<%= h.changeCase.pascal(documentType) %>LocalState>;
  }>,
): <%= h.changeCase.pascal(documentType) %>Document {
  const document = createDocument(
    state ? createState(
      createBaseState(state.auth, state.document),
      state.global,
      state.local,
    ) : undefined
  );

  return document;
}