/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 * Factory methods for creating FeatureDocument instances
 */
import type { PHAuthState, PHBaseState, PHDocumentState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model";
import type {
  FeatureDocument,
  FeatureGlobalState,
  FeatureLocalState,
  FeaturePHState,
} from "./types.js";
import { utils } from "./utils.js";

export function defaultGlobalState(): FeatureGlobalState {
  return {
    name: null,
    summary: null,
    scope: "MICRO_MVP",
    premise: null,
    expectedEffect: null,
    reasoning: null,
    targets: [],
    segments: [],
    role: null,
    relatedStep: null,
    confidence: null,
    effort: null,
    impact: null,
    targetRelease: null,
    evidence: [],
    notes: null,
    status: "PROPOSED",
    promotion: null,
    parentFeature: null,
    wbs: null,
    agentFeedback: {
      readyForFeedback: false,
      suggestions: [],
    },
  };
}

export function defaultLocalState(): FeatureLocalState {
  return {};
}

export function defaultPHState(): FeaturePHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<FeatureGlobalState>,
): FeatureGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  };
}

export function createLocalState(
  state?: Partial<FeatureLocalState>,
): FeatureLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as FeatureLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<FeatureGlobalState>,
  localState?: Partial<FeatureLocalState>,
): FeaturePHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a FeatureDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createFeatureDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<FeatureGlobalState>;
    local?: Partial<FeatureLocalState>;
  }>,
): FeatureDocument {
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
