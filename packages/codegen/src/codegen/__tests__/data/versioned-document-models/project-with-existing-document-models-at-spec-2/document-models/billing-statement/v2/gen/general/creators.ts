import { createAction } from "document-model/core";
import {
  EditBillingStatementInputSchema,
  EditContributorInputSchema,
  EditStatusInputSchema,
} from "../schema/zod.js";
import type {
  EditBillingStatementInput,
  EditContributorInput,
  EditStatusInput,
} from "../types.js";
import type {
  EditBillingStatementAction,
  EditContributorAction,
  EditStatusAction,
} from "./actions.js";

export const editBillingStatement = (input: EditBillingStatementInput) =>
  createAction<EditBillingStatementAction>(
    "EDIT_BILLING_STATEMENT",
    { ...input },
    undefined,
    EditBillingStatementInputSchema,
    "global",
  );

export const editContributor = (input: EditContributorInput) =>
  createAction<EditContributorAction>(
    "EDIT_CONTRIBUTOR",
    { ...input },
    undefined,
    EditContributorInputSchema,
    "global",
  );

export const editStatus = (input: EditStatusInput) =>
  createAction<EditStatusAction>(
    "EDIT_STATUS",
    { ...input },
    undefined,
    EditStatusInputSchema,
    "global",
  );
