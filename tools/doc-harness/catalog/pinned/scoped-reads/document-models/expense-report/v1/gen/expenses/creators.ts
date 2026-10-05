/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  ApproveExpenseInputSchema,
  SubmitExpenseInputSchema,
} from "../schema/zod.js";
import type { ApproveExpenseInput, SubmitExpenseInput } from "../types.js";
import type { ApproveExpenseAction, SubmitExpenseAction } from "./actions.js";

export const submitExpense = (input: SubmitExpenseInput) =>
  createAction<SubmitExpenseAction>(
    "SUBMIT_EXPENSE",
    { ...input },
    undefined,
    SubmitExpenseInputSchema,
    "global",
  );

export const approveExpense = (input: ApproveExpenseInput) =>
  createAction<ApproveExpenseAction>(
    "APPROVE_EXPENSE",
    { ...input },
    undefined,
    ApproveExpenseInputSchema,
    "global",
  );
