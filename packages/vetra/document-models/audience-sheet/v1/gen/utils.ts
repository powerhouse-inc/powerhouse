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
  assertIsAudienceSheetDocument,
  assertIsAudienceSheetState,
  isAudienceSheetDocument,
  isAudienceSheetState,
} from "./document-schema.js";
import { audienceSheetDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type {
  AudienceSheetGlobalState,
  AudienceSheetLocalState,
  AudienceSheetPHState,
} from "./types.js";

export const initialGlobalState: AudienceSheetGlobalState = {
  segments: [],
  agentFeedback: {
    readyForFeedback: false,
    suggestions: [],
  },
};
export const initialLocalState: AudienceSheetLocalState = {};

export const utils: DocumentModelUtils<AudienceSheetPHState> = {
  fileExtension: "aus",
  createState(state) {
    return {
      ...defaultBaseState(),
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createDocument(state) {
    const document = baseCreateDocument(utils.createState, state);

    document.header.documentType = audienceSheetDocumentType;

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
    return isAudienceSheetState(state);
  },
  assertIsStateOfType(state) {
    return assertIsAudienceSheetState(state);
  },
  isDocumentOfType(document) {
    return isAudienceSheetDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsAudienceSheetDocument(document);
  },
};
