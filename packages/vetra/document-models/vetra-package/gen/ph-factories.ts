/**
 * Factory methods for creating VetraPackageDocument instances
 */
import type { PHAuthState, PHBaseState, PHDocumentState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model/core";
import type {
  VetraPackageDocument,
  VetraPackageGlobalState,
  VetraPackageLocalState,
  VetraPackagePHState,
} from "./types.js";
import { createDocument } from "./utils.js";

export function defaultGlobalState(): VetraPackageGlobalState {
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
  state?: Partial<VetraPackageGlobalState>,
): VetraPackageGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  } as VetraPackageGlobalState;
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
  globalState?: Partial<VetraPackageGlobalState>,
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
    global?: Partial<VetraPackageGlobalState>;
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
