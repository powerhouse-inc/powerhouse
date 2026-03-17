import type { DocumentModelUtils } from "document-model";
import {
  baseCreateDocument,
  baseLoadFromInput,
  baseSaveToFileHandle,
  defaultBaseState,
  generateId,
} from "document-model";
import {
  assertIsTodoDocument,
  assertIsTodoState,
  isTodoDocument,
  isTodoState,
} from "./document-schema.js";
import { todoDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type { TodoGlobalState, TodoLocalState, TodoPHState } from "./types.js";

export const initialGlobalState: TodoGlobalState = { todos: [], title: "" };
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
