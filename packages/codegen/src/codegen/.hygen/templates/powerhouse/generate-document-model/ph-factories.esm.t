---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/ph-factories.ts"
force: true
---
/**
 * Factory methods for creating <%= h.changeCase.pascal(documentType) %>Document instances
 */
import type {
  PHAuthState,
  PHDocumentState,
  PHBaseState,
} from "document-model";
import {
  createBaseState,
  defaultBaseState,
} from "document-model";
import type {
  <%= h.changeCase.pascal(documentType) %>Document,
  <%= h.changeCase.pascal(documentType) %>LocalState,
  <%= h.changeCase.pascal(documentType) %>GlobalState,
  <%= h.changeCase.pascal(documentType) %>PHState,
} from "./types.js";
import { createDocument } from "./utils.js";

export function defaultGlobalState(): <%= h.changeCase.pascal(documentType) %>GlobalState {
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
  state?: Partial<<%= h.changeCase.pascal(documentType) %>GlobalState>,
): <%= h.changeCase.pascal(documentType) %>GlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  } as <%= h.changeCase.pascal(documentType) %>GlobalState;
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
  globalState?: Partial<<%= h.changeCase.pascal(documentType) %>GlobalState>,
  localState?: Partial<<%= h.changeCase.pascal(documentType) %>LocalState>,
): <%= h.changeCase.pascal(documentType) %>PHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a <%= h.changeCase.pascal(documentType) %>Document with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function create<%= h.changeCase.pascal(documentType) %>Document(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<<%= h.changeCase.pascal(documentType) %>GlobalState>;
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