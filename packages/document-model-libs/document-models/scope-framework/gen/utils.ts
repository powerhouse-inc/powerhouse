import { DocumentModelUtils } from "document-model";
import {
    ScopeFrameworkAction,
    ScopeFrameworkState,
    ScopeFrameworkLocalState,
} from "./types";
import { reducer } from "./reducer";

export const initialGlobalState: ScopeFrameworkState = {
  rootPath: "A",
  elements: [
    {
      id: "hruFam5ot7s0Gb1n+aIBa+y+NJA=",
      name: "Scope Name",
      version: 1,
      type: "Scope",
      path: "A.1",
      components: {
        content: "Scope description goes here.",
      },
    },
  ],
};
export const initialLocalState: ScopeFrameworkLocalState = {};

export const utils: DocumentModelUtils<
  ScopeFrameworkState,
  ScopeFrameworkAction,
  ScopeFrameworkLocalState
> = {
  fileExtension: "mdsf",
  createState(state) {
    return {
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createExtendedState(extendedState) {
    return baseCreateExtendedState(
      { ...extendedState, documentType: "makerdao/scope-framework" },
      utils.createState,
    );
  },
  createDocument(state) {
    return baseCreateDocument(
      utils.createExtendedState(state),
      utils.createState,
    );
  },
  saveToFile(document, path, name) {
    return baseSaveToFile(document, path, "mdsf", name);
  },
  saveToFileHandle(document, input) {
    return baseSaveToFileHandle(document, input);
  },
  loadFromFile(path) {
    return baseLoadFromFile(path, reducer);
  },
  loadFromInput(input) {
    return baseLoadFromInput(input, reducer);
  },
};


