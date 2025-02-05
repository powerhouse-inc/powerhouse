import { DocumentModelUtils } from "document-model";
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

export const utils: DocumentModelUtils<
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
    return baseCreateExtendedState(
      { ...extendedState, documentType: "powerhouse/budget-statement" },
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
    return baseSaveToFile(document, path, "phbs", name);
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


