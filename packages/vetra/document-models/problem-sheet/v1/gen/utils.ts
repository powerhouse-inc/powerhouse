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
  assertIsProblemSheetDocument,
  assertIsProblemSheetState,
  isProblemSheetDocument,
  isProblemSheetState,
} from "./document-schema.js";
import { problemSheetDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type {
  ProblemSheetGlobalState,
  ProblemSheetLocalState,
  ProblemSheetPHState,
} from "./types.js";

export const initialGlobalState: ProblemSheetGlobalState = {
  context: null,
  coreJob: null,
  coreJobSteps: [],
  roles: [],
  outcomes: [],
  constraints: [],
  agentFeedback: {
    readyForFeedback: false,
    suggestions: [],
  },
};
export const initialLocalState: ProblemSheetLocalState = {};

export const utils: DocumentModelUtils<ProblemSheetPHState> = {
  fileExtension: "prs",
  createState(state) {
    return {
      ...defaultBaseState(),
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createDocument(state) {
    const document = baseCreateDocument(utils.createState, state);

    document.header.documentType = problemSheetDocumentType;

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
    return isProblemSheetState(state);
  },
  assertIsStateOfType(state) {
    return assertIsProblemSheetState(state);
  },
  isDocumentOfType(document) {
    return isProblemSheetDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsProblemSheetDocument(document);
  },
};
