/**
 * Factory methods for creating VetraPackageDocument instances
 */

import {
  createBaseState,
  defaultBaseState,
  type PHAuthState,
  type PHDocumentState,
  type PHBaseState,
} from "document-model";
import type {
  VetraPackageDocument,
  VetraPackageLocalState,
  VetraPackageState,
} from "./types.js";
import { createDocument } from "./utils.js";

export type VetraPackagePHState = PHBaseState & {
  global: VetraPackageState;
  local: VetraPackageLocalState;
};

export function defaultGlobalState(): VetraPackageState {
  return {
    name: null,
    description: null,
    category: null,
    author: {
      name: null,
      website: null,
    },
    keywords: [],
    githubUrl: null,
    npmUrl: null,
  };
}

export function defaultLocalState(): VetraPackageLocalState {
  return {};
}

export function defaultPHState(): VetraPackagePHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<VetraPackageState>,
): VetraPackageState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  } as VetraPackageState;
}

export function createLocalState(
  state?: Partial<VetraPackageLocalState>,
): VetraPackageLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as VetraPackageLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<VetraPackageState>,
  localState?: Partial<VetraPackageLocalState>,
): VetraPackagePHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a VetraPackageDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createVetraPackageDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<VetraPackageState>;
    local?: Partial<VetraPackageLocalState>;
  }>,
): VetraPackageDocument {
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
