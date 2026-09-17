/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { DocumentModelUtils, PHBaseState, Reducer } from "document-model";
import {
  baseCreateDocument,
  baseLoadFromInputVersioned,
  baseSaveToFileHandle,
  createBaseState,
} from "document-model";
import { expenseReportUpgradeManifest } from "../../upgrades/upgrade-manifest.js";
import {
  assertIsExpenseReportDocument,
  assertIsExpenseReportState,
  isExpenseReportDocument,
  isExpenseReportState,
} from "./document-schema.js";
import { expenseReportDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type {
  ExpenseReportGlobalState,
  ExpenseReportLocalState,
  ExpenseReportPHState,
} from "./types.js";

export const initialGlobalState: ExpenseReportGlobalState = { expenses: [] };
export const initialLocalState: ExpenseReportLocalState = { reviewNotes: [] };

export const utils: DocumentModelUtils<ExpenseReportPHState> = {
  fileExtension: "exprpt",
  createState(state) {
    return {
      ...createBaseState(state?.auth, { version: 1, ...state?.document }),
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createDocument(state) {
    return baseCreateDocument(
      utils.createState,
      state,
      expenseReportDocumentType,
    );
  },
  saveToFileHandle(document, input) {
    return baseSaveToFileHandle(document, input);
  },
  loadFromInput(input) {
    return baseLoadFromInputVersioned(input, {
      reducers: { 1: reducer as unknown as Reducer<PHBaseState> },
      upgradeManifest: expenseReportUpgradeManifest,
    });
  },
  isStateOfType(state) {
    return isExpenseReportState(state);
  },
  assertIsStateOfType(state) {
    return assertIsExpenseReportState(state);
  },
  isDocumentOfType(document) {
    return isExpenseReportDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsExpenseReportDocument(document);
  },
};
