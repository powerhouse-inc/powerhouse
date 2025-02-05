import { z } from "zod";
import {
  Account,
  AddAccountInput,
  AddAuditReportInput,
  AddCommentInput,
  AddLineItemInput,
  AddVestingInput,
  AuditReport,
  AuditReportStatus,
  BudgetStatementLocalState,
  BudgetStatementState,
  BudgetStatus,
  Comment,
  CommentAuthor,
  CommentAuthorInput,
  DeleteAccountInput,
  DeleteAuditReportInput,
  DeleteCommentInput,
  DeleteLineItemInput,
  DeleteVestingInput,
  Ftes,
  FtesForecast,
  FtesForecastInput,
  LineItem,
  LineItemCategory,
  LineItemForecast,
  LineItemGroup,
  LineItemInput,
  LineItemUpdateInput,
  LineItemsSortInput,
  Owner,
  SetFtesInput,
  SetMonthInput,
  SetOwnerInput,
  SetQuoteCurrencyInput,
  SortAccountsInput,
  SortLineItemsInput,
  UpdateAccountInput,
  UpdateCommentInput,
  UpdateLineItemInput,
  UpdateVestingInput,
  Vesting,
} from "./types";

type Properties<T> = Required<{
  [K in keyof T]: z.ZodType<T[K], any, T[K]>;
}>;

type definedNonNullAny = {};

export const isDefinedNonNullAny = (v: any): v is definedNonNullAny =>
  v !== undefined && v !== null;

export const definedNonNullAnySchema = z
  .any()
  .refine((v) => isDefinedNonNullAny(v));

export const AuditReportStatusSchema = z.enum([
  "Approved",
  "ApprovedWithComments",
  "Escalated",
  "NeedsAction",
]);

export const BudgetStatusSchema = z.enum([
  "Draft",
  "Escalated",
  "Final",
  "Review",
]);

export function AccountSchema(): z.ZodObject<Properties<Account>> {
  return z.object({
    __typename: z.literal("Account").optional(),
    address: z.string(),
    lineItems: z.array(LineItemSchema()),
    name: z.string(),
  });
}

export function AddAccountInputSchema(): z.ZodObject<
  Properties<AddAccountInput>
> {
  return z.object({
    address: z.string(),
    lineItems: z.array(z.lazy(() => LineItemInputSchema())).nullish(),
    name: z.string().nullish(),
  });
}

export function AddAuditReportInputSchema(): z.ZodObject<
  Properties<AddAuditReportInput>
> {
  return z.object({
    report: z.string(),
    status: AuditReportStatusSchema,
    timestamp: z.string().datetime().nullish(),
  });
}

export function AddCommentInputSchema(): z.ZodObject<
  Properties<AddCommentInput>
> {
  return z.object({
    author: z.lazy(() => CommentAuthorInputSchema().nullish()),
    comment: z.string(),
    key: z.string().nullish(),
    status: BudgetStatusSchema.nullish(),
    timestamp: z.string().datetime().nullish(),
  });
}

export function AddLineItemInputSchema(): z.ZodObject<
  Properties<AddLineItemInput>
> {
  return z.object({
    accountId: z.string(),
    actual: z.number().nullish(),
    budgetCap: z.number().nullish(),
    category: LineItemCategorySchema().nullish(),
    comment: z.string().nullish(),
    forecast: z.array(LineItemForecastSchema()).nullish(),
    group: LineItemGroupSchema().nullish(),
    headcountExpense: z.boolean().nullish(),
    payment: z.number().nullish(),
  });
}

export function AddVestingInputSchema(): z.ZodObject<
  Properties<AddVestingInput>
> {
  return z.object({
    amount: z.string().nullish(),
    amountOld: z.string().nullish(),
    comment: z.string().nullish(),
    currency: z.string().nullish(),
    date: z.string().nullish(),
    key: z.string().nullish(),
    vested: z.boolean().nullish(),
  });
}

export function AuditReportSchema(): z.ZodObject<Properties<AuditReport>> {
  return z.object({
    __typename: z.literal("AuditReport").optional(),
    report: z.string(),
    status: AuditReportStatusSchema,
    timestamp: z.string().datetime(),
  });
}

export function BudgetStatementLocalStateSchema(): z.ZodObject<
  Properties<BudgetStatementLocalState>
> {
  return z.object({
    __typename: z.literal("BudgetStatementLocalState").optional(),
  });
}

export function BudgetStatementStateSchema(): z.ZodObject<
  Properties<BudgetStatementState>
> {
  return z.object({
    __typename: z.literal("BudgetStatementState").optional(),
    accounts: z.array(AccountSchema()),
    auditReports: z.array(AuditReportSchema()),
    comments: z.array(CommentSchema()),
    ftes: FtesSchema().nullable(),
    month: z.string().nullable(),
    owner: OwnerSchema().nullable(),
    quoteCurrency: z.string().nullable(),
    vesting: z.array(VestingSchema()),
  });
}

export function CommentSchema(): z.ZodObject<Properties<Comment>> {
  return z.object({
    __typename: z.literal("Comment").optional(),
    author: CommentAuthorSchema(),
    comment: z.string(),
    key: z.string(),
    status: BudgetStatusSchema,
    timestamp: z.string().datetime(),
  });
}

export function CommentAuthorSchema(): z.ZodObject<Properties<CommentAuthor>> {
  return z.object({
    __typename: z.literal("CommentAuthor").optional(),
    id: z.string().nullable(),
    ref: z.string().nullable(),
    roleLabel: z.string().nullable(),
    username: z.string().nullable(),
  });
}

export function CommentAuthorInputSchema(): z.ZodObject<
  Properties<CommentAuthorInput>
> {
  return z.object({
    id: z.string().nullish(),
    ref: z.string().nullish(),
    roleLabel: z.string().nullish(),
    username: z.string().nullish(),
  });
}

export function DeleteAccountInputSchema(): z.ZodObject<
  Properties<DeleteAccountInput>
> {
  return z.object({
    account: z.string(),
  });
}

export function DeleteAuditReportInputSchema(): z.ZodObject<
  Properties<DeleteAuditReportInput>
> {
  return z.object({
    report: z.string(),
  });
}

export function DeleteCommentInputSchema(): z.ZodObject<
  Properties<DeleteCommentInput>
> {
  return z.object({
    comment: z.string(),
  });
}

export function DeleteLineItemInputSchema(): z.ZodObject<
  Properties<DeleteLineItemInput>
> {
  return z.object({
    accountId: z.string(),
    category: z.string().nullish(),
    group: z.string().nullish(),
  });
}

export function DeleteVestingInputSchema(): z.ZodObject<
  Properties<DeleteVestingInput>
> {
  return z.object({
    vesting: z.string(),
  });
}

export function FtesSchema(): z.ZodObject<Properties<Ftes>> {
  return z.object({
    __typename: z.literal("Ftes").optional(),
    forecast: z.array(FtesForecastSchema()),
    value: z.number(),
  });
}

export function FtesForecastSchema(): z.ZodObject<Properties<FtesForecast>> {
  return z.object({
    __typename: z.literal("FtesForecast").optional(),
    month: z.string(),
    value: z.number(),
  });
}

export function FtesForecastInputSchema(): z.ZodObject<
  Properties<FtesForecastInput>
> {
  return z.object({
    month: z.string(),
    value: z.number(),
  });
}

export function LineItemSchema(): z.ZodObject<Properties<LineItem>> {
  return z.object({
    __typename: z.literal("LineItem").optional(),
    actual: z.number().nullable(),
    budgetCap: z.number().nullable(),
    category: LineItemCategorySchema().nullable(),
    comment: z.string().nullable(),
    forecast: z.array(LineItemForecastSchema()),
    group: LineItemGroupSchema().nullable(),
    headcountExpense: z.boolean(),
    payment: z.number().nullable(),
  });
}

export function LineItemCategorySchema(): z.ZodObject<
  Properties<LineItemCategory>
> {
  return z.object({
    __typename: z.literal("LineItemCategory").optional(),
    id: z.string(),
    ref: z.string(),
    title: z.string(),
  });
}

export function LineItemForecastSchema(): z.ZodObject<
  Properties<LineItemForecast>
> {
  return z.object({
    __typename: z.literal("LineItemForecast").optional(),
    budgetCap: z.number(),
    month: z.string(),
    value: z.number(),
  });
}

export function LineItemGroupSchema(): z.ZodObject<Properties<LineItemGroup>> {
  return z.object({
    __typename: z.literal("LineItemGroup").optional(),
    color: z.string(),
    id: z.string(),
    ref: z.string(),
    title: z.string(),
  });
}

export function LineItemInputSchema(): z.ZodObject<Properties<LineItemInput>> {
  return z.object({
    actual: z.number().nullish(),
    budgetCap: z.number().nullish(),
    category: LineItemCategorySchema().nullish(),
    comment: z.string().nullish(),
    forecast: z.array(LineItemForecastSchema()).nullish(),
    group: LineItemGroupSchema().nullish(),
    headcountExpense: z.boolean().nullish(),
    payment: z.number().nullish(),
  });
}

export function LineItemUpdateInputSchema(): z.ZodObject<
  Properties<LineItemUpdateInput>
> {
  return z.object({
    actual: z.number().nullish(),
    budgetCap: z.number().nullish(),
    category: z.string().nullish(),
    comment: z.string().nullish(),
    forecast: z.array(LineItemForecastSchema()).nullish(),
    group: z.string().nullish(),
    headcountExpense: z.boolean().nullish(),
    payment: z.number().nullish(),
  });
}

export function LineItemsSortInputSchema(): z.ZodObject<
  Properties<LineItemsSortInput>
> {
  return z.object({
    category: z.string().nullish(),
    group: z.string().nullish(),
  });
}

export function OwnerSchema(): z.ZodObject<Properties<Owner>> {
  return z.object({
    __typename: z.literal("Owner").optional(),
    id: z.string().nullable(),
    ref: z.string().nullable(),
    title: z.string().nullable(),
  });
}

export function SetFtesInputSchema(): z.ZodObject<Properties<SetFtesInput>> {
  return z.object({
    forecast: z.array(z.lazy(() => FtesForecastInputSchema())),
    value: z.number(),
  });
}

export function SetMonthInputSchema(): z.ZodObject<Properties<SetMonthInput>> {
  return z.object({
    month: z.string(),
  });
}

export function SetOwnerInputSchema(): z.ZodObject<Properties<SetOwnerInput>> {
  return z.object({
    id: z.string().nullish(),
    ref: z.string().nullish(),
    title: z.string().nullish(),
  });
}

export function SetQuoteCurrencyInputSchema(): z.ZodObject<
  Properties<SetQuoteCurrencyInput>
> {
  return z.object({
    quoteCurrency: z.string(),
  });
}

export function SortAccountsInputSchema(): z.ZodObject<
  Properties<SortAccountsInput>
> {
  return z.object({
    accounts: z.array(z.string()),
  });
}

export function SortLineItemsInputSchema(): z.ZodObject<
  Properties<SortLineItemsInput>
> {
  return z.object({
    accountId: z.string(),
    lineItems: z.array(z.lazy(() => LineItemsSortInputSchema())),
  });
}

export function UpdateAccountInputSchema(): z.ZodObject<
  Properties<UpdateAccountInput>
> {
  return z.object({
    address: z.string(),
    lineItems: z.array(LineItemSchema()).nullish(),
    name: z.string().nullish(),
  });
}

export function UpdateCommentInputSchema(): z.ZodObject<
  Properties<UpdateCommentInput>
> {
  return z.object({
    author: z.lazy(() => CommentAuthorInputSchema().nullish()),
    comment: z.string().nullish(),
    key: z.string(),
    status: BudgetStatusSchema.nullish(),
    timestamp: z.string().datetime().nullish(),
  });
}

export function UpdateLineItemInputSchema(): z.ZodObject<
  Properties<UpdateLineItemInput>
> {
  return z.object({
    accountId: z.string(),
    actual: z.number().nullish(),
    budgetCap: z.number().nullish(),
    category: z.string().nullish(),
    comment: z.string().nullish(),
    forecast: z.array(LineItemForecastSchema()).nullish(),
    group: z.string().nullish(),
    headcountExpense: z.boolean().nullish(),
    payment: z.number().nullish(),
  });
}

export function UpdateVestingInputSchema(): z.ZodObject<
  Properties<UpdateVestingInput>
> {
  return z.object({
    amount: z.string().nullish(),
    amountOld: z.string().nullish(),
    comment: z.string().nullish(),
    currency: z.string().nullish(),
    date: z.string().nullish(),
    key: z.string(),
    vested: z.boolean().nullish(),
  });
}

export function VestingSchema(): z.ZodObject<Properties<Vesting>> {
  return z.object({
    __typename: z.literal("Vesting").optional(),
    amount: z.string(),
    amountOld: z.string(),
    comment: z.string(),
    currency: z.string(),
    date: z.string(),
    key: z.string(),
    vested: z.boolean(),
  });
}
