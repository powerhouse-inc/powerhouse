import { DocumentModelUtils, utils as base } from "document-model/document";
import {
  BudgetStatementAction,
  BudgetStatementState,
  BudgetStatementLocalState,
} from "./types";
import { reducer } from "./reducer";

export const initialGlobalState: BudgetStatementState = {
  owner: {
    ref: null,
    id: null,
    title: null,
  },
  month: null,
  quoteCurrency: null,
  vesting: [],
  ftes: null,
  accounts: [],
  auditReports: [],
  comments: [],
};
export const initialLocalState: BudgetStatementLocalState = {};

const utils: DocumentModelUtils<
  BudgetStatementState,
  BudgetStatementAction,
  BudgetStatementLocalState
> = {
  fileExtension: "phbs",
  createState(state) {
    return {
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createExtendedState(extendedState) {
    return base.createExtendedState(
      { ...extendedState, documentType: "powerhouse/budget-statement" },
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
    return base.saveToFile(document, path, "phbs", name);
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
