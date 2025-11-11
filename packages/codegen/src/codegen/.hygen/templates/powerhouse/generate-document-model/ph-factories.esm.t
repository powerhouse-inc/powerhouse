---
to: "<%= rootDir %>/<%= paramCaseDocumentType %>/gen/ph-factories.ts"
force: true
---
/**
 * Factory methods for creating <%= phDocumentTypeName %> instances
 */
import type {
  PHAuthState,
  PHDocumentState,
  PHBaseState,
} from "document-model";
import {
  createBaseState,
  defaultBaseState,
} from "document-model/core";
import type {
  <%= phDocumentTypeName %>,
  <%= localStateName %>,
  <%= globalStateName %>,
  <%= phStateName %>,
} from "./types.js";
import { createDocument } from "./utils.js";

export function defaultGlobalState(): <%= globalStateName %> {
  return <%- initialGlobalState %>;
}

export function defaultLocalState(): <%= localStateName %> {
  return <%- initialLocalState %>;
}

export function defaultPHState(): <%= phStateName %> {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<<%= globalStateName %>>,
): <%= globalStateName %> {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  } as <%= globalStateName %>;
}

export function createLocalState(
  state?: Partial<<%= localStateName %>>,
): <%= localStateName %> {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as <%= localStateName %>;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<<%= globalStateName %>>,
  localState?: Partial<<%= localStateName %>>,
): <%= phStateName %> {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a <%= phDocumentTypeName %> with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function create<%= phDocumentTypeName %>(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<<%= globalStateName %>>;
    local?: Partial<<%= localStateName %>>;
  }>,
): <%= phDocumentTypeName %> {
  const document = createDocument(
    state ? createState(
      createBaseState(state.auth, state.document),
      state.global,
      state.local,
    ) : undefined
  );

  return document;
}