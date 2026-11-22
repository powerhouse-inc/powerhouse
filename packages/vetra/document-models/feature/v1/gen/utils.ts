/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { DocumentModelUtils } from "document-model";
import {
  baseCreateDocument,
  baseLoadFromInput,
  baseSaveToFileHandle,
  defaultBaseState,
  generateId,
} from "document-model";
import {
  assertIsFeatureDocument,
  assertIsFeatureState,
  isFeatureDocument,
  isFeatureState,
} from "./document-schema.js";
import { featureDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type {
  FeatureGlobalState,
  FeatureLocalState,
  FeaturePHState,
} from "./types.js";

export const initialGlobalState: FeatureGlobalState = {
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
export const initialLocalState: FeatureLocalState = {};

export const utils: DocumentModelUtils<FeaturePHState> = {
  fileExtension: "ftr",
  createState(state) {
    return {
      ...defaultBaseState(),
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createDocument(state) {
    const document = baseCreateDocument(utils.createState, state);

    document.header.documentType = featureDocumentType;

    // for backwards compatibility, but this is NOT a valid signed document id
    document.header.id = generateId();

    return document;
  },
  saveToFileHandle(document, input) {
    return baseSaveToFileHandle(document, input);
  },
  loadFromInput(input) {
    return baseLoadFromInput(input, reducer);
  },
  isStateOfType(state) {
    return isFeatureState(state);
  },
  assertIsStateOfType(state) {
    return assertIsFeatureState(state);
  },
  isDocumentOfType(document) {
    return isFeatureDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsFeatureDocument(document);
  },
};
