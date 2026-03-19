import type { DocumentModelUtils } from "@powerhousedao/shared/document-model";
import {
    baseCreateDocument,
    baseLoadFromInput,
    baseSaveToFileHandle,
    defaultBaseState,
    generateId,
} from "@powerhousedao/shared/document-model";
import {
    assertIsBillingStatementDocument,
    assertIsBillingStatementState,
    isBillingStatementDocument,
    isBillingStatementState,
} from "./document-schema.js";
import { billingStatementDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type {
    BillingStatementGlobalState,
    BillingStatementLocalState,
    BillingStatementPHState,
} from "./types.js";

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

