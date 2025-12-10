import type { DocumentModelUtils } from "document-model";
import {
  baseCreateDocument,
  baseSaveToFileHandle,
  baseLoadFromInput,
  defaultBaseState,
  generateId,
} from "document-model/core";
import type {
  ToDoDocumentGlobalState,
  ToDoDocumentLocalState,
} from "./types.js";
import type { ToDoDocumentPHState } from "./types.js";
import { reducer } from "./reducer.js";
import { toDoDocumentDocumentType } from "./document-type.js";
import {
  isToDoDocumentDocument,
  assertIsToDoDocumentDocument,
  isToDoDocumentState,
  assertIsToDoDocumentState,
} from "./document-schema.js";

export const initialGlobalState: ToDoDocumentGlobalState = {
  items: [],
  stats: {
    total: 0,
    checked: 0,
    unchecked: 0,
  },
};
export const initialLocalState: ToDoDocumentLocalState = {};

export const utils: DocumentModelUtils<ToDoDocumentPHState> = {
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

    document.header.documentType = toDoDocumentDocumentType;

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
    return isToDoDocumentState(state);
  },
  assertIsStateOfType(state) {
    return assertIsToDoDocumentState(state);
  },
  isDocumentOfType(document) {
    return isToDoDocumentDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsToDoDocumentDocument(document);
  },
};

export const createDocument = utils.createDocument;
export const createState = utils.createState;
export const saveToFileHandle = utils.saveToFileHandle;
export const loadFromInput = utils.loadFromInput;
export const isStateOfType = utils.isStateOfType;
export const assertIsStateOfType = utils.assertIsStateOfType;
export const isDocumentOfType = utils.isDocumentOfType;
export const assertIsDocumentOfType = utils.assertIsDocumentOfType;
