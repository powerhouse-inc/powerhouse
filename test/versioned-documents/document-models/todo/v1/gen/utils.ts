/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { DocumentModelUtils, PHBaseState, Reducer } from "document-model";
import {
  baseCreateDocument,
  baseLoadFromInputVersioned,
  baseSaveToFileHandle,
  defaultBaseState,
} from "document-model";
import { todoUpgradeManifest } from "../../upgrades/upgrade-manifest.js";
import {
  assertIsTodoDocument,
  assertIsTodoState,
  isTodoDocument,
  isTodoState,
} from "./document-schema.js";
import { todoDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type { TodoGlobalState, TodoLocalState, TodoPHState } from "./types.js";

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
    return baseCreateDocument(utils.createState, state, todoDocumentType);
  },
  saveToFileHandle(document, input) {
    return baseSaveToFileHandle(document, input);
  },
  loadFromInput(input) {
    return baseLoadFromInputVersioned(input, {
      reducers: { 1: reducer as unknown as Reducer<PHBaseState> },
      upgradeManifest: todoUpgradeManifest,
    });
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
