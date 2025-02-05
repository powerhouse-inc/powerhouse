import { DocumentModelUtils, utils as base } from "document-model/document";
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

const utils: DocumentModelUtils<
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
    return base.createExtendedState(
      { ...extendedState, documentType: "makerdao/scope-framework" },
      utils.createState,
    );
  },
  createDocument(state) {
    return base.createDocument(
      utils.createExtendedState(state),
      utils.createState,
    );
  },
  saveToFile(document, path, name) {
    return base.saveToFile(document, path, "mdsf", name);
  },
  saveToFileHandle(document, input) {
    return base.saveToFileHandle(document, input);
  },
  loadFromFile(path) {
    return base.loadFromFile(path, reducer);
  },
  loadFromInput(input) {
    return base.loadFromInput(input, reducer);
  },
};

export default utils;
