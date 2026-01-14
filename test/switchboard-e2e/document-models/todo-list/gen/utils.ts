import type { DocumentModelUtils } from "document-model";
import {
  baseCreateDocument,
  baseSaveToFileHandle,
  baseLoadFromInput,
  defaultBaseState,
  generateId,
} from "document-model/core";
import type { TodoListGlobalState, TodoListLocalState } from "./types.js";
import type { TodoListPHState } from "./types.js";
import { reducer } from "./reducer.js";
import { todoListDocumentType } from "./document-type.js";
import {
  isTodoListDocument,
  assertIsTodoListDocument,
  isTodoListState,
  assertIsTodoListState,
} from "./document-schema.js";

export const initialGlobalState: TodoListGlobalState = {
  items: [],
};
export const initialLocalState: TodoListLocalState = {};

export const utils: DocumentModelUtils<TodoListPHState> = {
  fileExtension: "",
  createState(state) {
    return {
      ...defaultBaseState(),
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createDocument(state) {
    const document = baseCreateDocument(utils.createState, state);

    document.header.documentType = todoListDocumentType;

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
    return isTodoListState(state);
  },
  assertIsStateOfType(state) {
    return assertIsTodoListState(state);
  },
  isDocumentOfType(document) {
    return isTodoListDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsTodoListDocument(document);
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
