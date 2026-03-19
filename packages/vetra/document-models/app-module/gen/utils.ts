import type { DocumentModelUtils } from "@powerhousedao/shared/document-model";
import {
  baseCreateDocument,
  baseLoadFromInput,
  baseSaveToFileHandle,
  defaultBaseState,
  generateId,
} from "@powerhousedao/shared/document-model";
import {
  assertIsAppModuleDocument,
  assertIsAppModuleState,
  isAppModuleDocument,
  isAppModuleState,
} from "./document-schema.js";
import { appModuleDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type {
  AppModuleGlobalState,
  AppModuleLocalState,
  AppModulePHState,
} from "./types.js";

export const initialGlobalState: AppModuleGlobalState = {
  name: "",
  status: "DRAFT",
  allowedDocumentTypes: null,
  isDragAndDropEnabled: true,
};
export const initialLocalState: AppModuleLocalState = {};

export const utils: DocumentModelUtils<AppModulePHState> = {
  fileExtension: ".phdm",
  createState(state) {
    return {
      ...defaultBaseState(),
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createDocument(state) {
    const document = baseCreateDocument(utils.createState, state);

    document.header.documentType = appModuleDocumentType;

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
    return isAppModuleState(state);
  },
  assertIsStateOfType(state) {
    return assertIsAppModuleState(state);
  },
  isDocumentOfType(document) {
    return isAppModuleDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsAppModuleDocument(document);
  },
};
