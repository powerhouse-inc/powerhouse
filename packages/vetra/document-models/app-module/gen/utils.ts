import type { DocumentModelUtils } from "document-model";
import {
  baseCreateDocument,
  baseSaveToFileHandle,
  baseLoadFromInput,
  defaultBaseState,
  generateId,
} from "document-model/core";
import type { AppModuleGlobalState, AppModuleLocalState } from "./types.js";
import type { AppModulePHState } from "./types.js";
import { reducer } from "./reducer.js";
import { appModuleDocumentType } from "./document-type.js";

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
};

export const createDocument = utils.createDocument;
export const createState = utils.createState;
export const saveToFileHandle = utils.saveToFileHandle;
export const loadFromInput = utils.loadFromInput;
