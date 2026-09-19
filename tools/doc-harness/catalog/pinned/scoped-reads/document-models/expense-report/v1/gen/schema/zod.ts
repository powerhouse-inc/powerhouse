/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as z from "zod";
import type {
  AddReviewNoteInput,
  ApproveExpenseInput,
  Expense,
  ExpenseReportLocalState,
  ExpenseReportState,
  ExpenseStatus,
  ReviewNote,
  SubmitExpenseInput,
} from "./types.js";

type Properties<T> = Required<{
  [K in keyof T]: z.ZodType<T[K]>;
}>;

type definedNonNullAny = {};

export const isDefinedNonNullAny = (v: any): v is definedNonNullAny =>
  v !== undefined && v !== null;

export const definedNonNullAnySchema = z
  .any()
  .refine((v) => isDefinedNonNullAny(v));

export const ExpenseStatusSchema = z.enum(["APPROVED", "PENDING"]);

export function AddReviewNoteInputSchema(): z.ZodObject<
  Properties<AddReviewNoteInput>
> {
  return z.object({
    expenseId: z.string(),
    note: z.string(),
  });
}

export function ApproveExpenseInputSchema(): z.ZodObject<
  Properties<ApproveExpenseInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function ExpenseSchema(): z.ZodObject<Properties<Expense>> {
  return z.object({
    __typename: z.literal("Expense").optional(),
    amountCents: z.number(),
    approvedBy: z.string().nullish(),
    id: z.string(),
    memo: z.string(),
    status: ExpenseStatusSchema,
  });
}

export function ExpenseReportLocalStateSchema(): z.ZodObject<
  Properties<ExpenseReportLocalState>
> {
  return z.object({
    __typename: z.literal("ExpenseReportLocalState").optional(),
    reviewNotes: z.array(z.lazy(() => ReviewNoteSchema())),
  });
}

export function ExpenseReportStateSchema(): z.ZodObject<
  Properties<ExpenseReportState>
> {
  return z.object({
    __typename: z.literal("ExpenseReportState").optional(),
    expenses: z.array(z.lazy(() => ExpenseSchema())),
  });
}

export function ReviewNoteSchema(): z.ZodObject<Properties<ReviewNote>> {
  return z.object({
    __typename: z.literal("ReviewNote").optional(),
    expenseId: z.string(),
    note: z.string(),
  });
}

export function SubmitExpenseInputSchema(): z.ZodObject<
  Properties<SubmitExpenseInput>
> {
  return z.object({
    amountCents: z.number(),
    id: z.string(),
    memo: z.string(),
  });
}
