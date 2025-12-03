// TODO: remove eslint-disable rules once refactor is done
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { StateReducer } from "document-model";
import { isDocumentAction, createReducer } from "document-model/core";
import type { BillingStatementPHState } from "test/document-models/billing-statement";

import { billingStatementGeneralOperations } from "../src/reducers/general.js";
import { billingStatementLineItemsOperations } from "../src/reducers/line-items.js";
import { billingStatementTagsOperations } from "../src/reducers/tags.js";

import {
  EditBillingStatementInputSchema,
  EditContributorInputSchema,
  EditStatusInputSchema,
  AddLineItemInputSchema,
  EditLineItemInputSchema,
  EditLineItemTagInputSchema,
} from "./schema/zod.js";

const stateReducer: StateReducer<BillingStatementPHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "EDIT_BILLING_STATEMENT": {
      EditBillingStatementInputSchema().parse(action.input);

      billingStatementGeneralOperations.editBillingStatementOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "EDIT_CONTRIBUTOR": {
      EditContributorInputSchema().parse(action.input);

      billingStatementGeneralOperations.editContributorOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "EDIT_STATUS": {
      EditStatusInputSchema().parse(action.input);

      billingStatementGeneralOperations.editStatusOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_LINE_ITEM": {
      AddLineItemInputSchema().parse(action.input);

      billingStatementLineItemsOperations.addLineItemOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "EDIT_LINE_ITEM": {
      EditLineItemInputSchema().parse(action.input);

      billingStatementLineItemsOperations.editLineItemOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "EDIT_LINE_ITEM_TAG": {
      EditLineItemTagInputSchema().parse(action.input);

      billingStatementTagsOperations.editLineItemTagOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    default:
      return state;
  }
};

export const reducer = createReducer<BillingStatementPHState>(stateReducer);
