import type { DocumentModelUtils } from "document-model";
import {
  baseCreateDocument,
  baseSaveToFileHandle,
  baseLoadFromInput,
  defaultBaseState,
  generateId,
} from "document-model/core";
import type {
  BillingStatementGlobalState,
  BillingStatementLocalState,
} from "./types.js";
import type { BillingStatementPHState } from "./types.js";
import { reducer } from "./reducer.js";
import { billingStatementDocumentType } from "./document-type.js";
import {
  isBillingStatementDocument,
  assertIsBillingStatementDocument,
  isBillingStatementState,
  assertIsBillingStatementState,
} from "./document-schema.js";

export const initialGlobalState: BillingStatementGlobalState = {
  contributor: "",
  dateIssued: "2025-06-10T15:42:17.873Z",
  dateDue: "2025-06-10T15:42:17.873Z",
  lineItems: [],
  status: "DRAFT",
  currency: "",
  totalCash: 0,
  totalPowt: 0,
  notes: "",
};
export const initialLocalState: BillingStatementLocalState = {};

export const utils: DocumentModelUtils<BillingStatementPHState> = {
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

    document.header.documentType = billingStatementDocumentType;

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
    return isBillingStatementState(state);
  },
  assertIsStateOfType(state) {
    return assertIsBillingStatementState(state);
  },
  isDocumentOfType(document) {
    return isBillingStatementDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsBillingStatementDocument(document);
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
