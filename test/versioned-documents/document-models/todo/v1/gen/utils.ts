import type { DocumentModelUtils } from "document-model";
import {
  baseCreateDocument,
  baseSaveToFileHandle,
  baseLoadFromInput,
  defaultBaseState,
  generateId,
} from "document-model/core";
import type { TodoGlobalState, TodoLocalState } from "./types.js";
import type { TodoPHState } from "./types.js";
import { reducer } from "./reducer.js";
import { todoDocumentType } from "./document-type.js";
import {
  isTodoDocument,
  assertIsTodoDocument,
  isTodoState,
  assertIsTodoState,
} from "./document-schema.js";

export const initialGlobalState: TodoGlobalState = { todos: [] };
export const initialLocalState: TodoLocalState = {};

export const utils: DocumentModelUtils<TodoPHState> = {
  fileExtension: "todo",
  createState(state) {
    return {
      ...defaultBaseState(),
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createDocument(state) {
    const document = baseCreateDocument(utils.createState, state);

    document.header.documentType = todoDocumentType;

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
    return isTodoState(state);
  },
  assertIsStateOfType(state) {
    return assertIsTodoState(state);
  },
  isDocumentOfType(document) {
    return isTodoDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsTodoDocument(document);
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
