import { z } from "zod";
import {
  AccountSnapshotLocalState,
  AccountSnapshotState,
  ActualsComparison,
  ActualsComparisonNetExpenses,
  ActualsComparisonNetExpensesItem,
  SetEndInput,
  SetIdInput,
  SetOwnerIdInput,
  SetOwnerTypeInput,
  SetPeriodInput,
  SetStartInput,
  SnapshotAccount,
  SnapshotAccountBalance,
  SnapshotAccountTransaction,
} from "./types.js";

type Properties<T> = Required<{
  [K in keyof T]: z.ZodType<T[K], any, T[K]>;
}>;

type definedNonNullAny = {};

export const isDefinedNonNullAny = (v: any): v is definedNonNullAny =>
  v !== undefined && v !== null;

export const definedNonNullAnySchema = z
  .any()
  .refine((v) => isDefinedNonNullAny(v));

export function AccountSnapshotLocalStateSchema(): z.ZodObject<
  Properties<AccountSnapshotLocalState>
> {
  return z.object({
    __typename: z.literal("AccountSnapshotLocalState").optional(),
  });
}

export function AccountSnapshotStateSchema(): z.ZodObject<
  Properties<AccountSnapshotState>
> {
  return z.object({
    __typename: z.literal("AccountSnapshotState").optional(),
    actualsComparison: z.array(ActualsComparisonSchema().nullable()).nullable(),
    end: z.string().nullable(),
    id: z.string(),
    ownerId: z.string().nullable(),
    ownerType: z.string().nullable(),
    period: z.string().nullable(),
    snapshotAccount: z.array(SnapshotAccountSchema().nullable()).nullable(),
    start: z.string().nullable(),
  });
}

export function ActualsComparisonSchema(): z.ZodObject<
  Properties<ActualsComparison>
> {
  return z.object({
    __typename: z.literal("ActualsComparison").optional(),
    currency: z.string().nullable(),
    month: z.string().nullable(),
    netExpenses: ActualsComparisonNetExpensesSchema().nullable(),
    reportedActuals: z.number().nullable(),
  });
}

export function ActualsComparisonNetExpensesSchema(): z.ZodObject<
  Properties<ActualsComparisonNetExpenses>
> {
  return z.object({
    __typename: z.literal("ActualsComparisonNetExpenses").optional(),
    offChainIncluded: ActualsComparisonNetExpensesItemSchema().nullable(),
    onChainOnly: ActualsComparisonNetExpensesItemSchema(),
  });
}

export function ActualsComparisonNetExpensesItemSchema(): z.ZodObject<
  Properties<ActualsComparisonNetExpensesItem>
> {
  return z.object({
    __typename: z.literal("ActualsComparisonNetExpensesItem").optional(),
    amount: z.number().nullable(),
    difference: z.number().nullable(),
  });
}

export function SetEndInputSchema(): z.ZodObject<Properties<SetEndInput>> {
  return z.object({
    end: z.string(),
  });
}

export function SetIdInputSchema(): z.ZodObject<Properties<SetIdInput>> {
  return z.object({
    id: z.string(),
  });
}

export function SetOwnerIdInputSchema(): z.ZodObject<
  Properties<SetOwnerIdInput>
> {
  return z.object({
    ownerId: z.string(),
  });
}

export function SetOwnerTypeInputSchema(): z.ZodObject<
  Properties<SetOwnerTypeInput>
> {
  return z.object({
    ownerType: z.string(),
  });
}

export function SetPeriodInputSchema(): z.ZodObject<
  Properties<SetPeriodInput>
> {
  return z.object({
    period: z.string(),
  });
}

export function SetStartInputSchema(): z.ZodObject<Properties<SetStartInput>> {
  return z.object({
    start: z.string(),
  });
}

export function SnapshotAccountSchema(): z.ZodObject<
  Properties<SnapshotAccount>
> {
  return z.object({
    __typename: z.literal("SnapshotAccount").optional(),
    accountAddress: z.string().nullable(),
    accountLabel: z.string().nullable(),
    accountType: z.string().nullable(),
    groupAccountId: z.string().nullable(),
    id: z.string(),
    offChain: z.boolean().nullable(),
    snapshotAccountBalance: z
      .array(SnapshotAccountBalanceSchema().nullable())
      .nullable(),
    snapshotAccountTransaction: z
      .array(SnapshotAccountTransactionSchema().nullable())
      .nullable(),
    upstreamAccountId: z.string().nullable(),
  });
}

export function SnapshotAccountBalanceSchema(): z.ZodObject<
  Properties<SnapshotAccountBalance>
> {
  return z.object({
    __typename: z.literal("SnapshotAccountBalance").optional(),
    id: z.string().nullable(),
    includesOffChain: z.boolean().nullable(),
    inflow: z.number().nullable(),
    initialBalance: z.number().nullable(),
    newBalance: z.number().nullable(),
    outflow: z.number().nullable(),
    token: z.string().nullable(),
  });
}

export function SnapshotAccountTransactionSchema(): z.ZodObject<
  Properties<SnapshotAccountTransaction>
> {
  return z.object({
    __typename: z.literal("SnapshotAccountTransaction").optional(),
    amount: z.number().nullable(),
    block: z.number().nullable(),
    counterParty: z.string().nullable(),
    counterPartyName: z.string().nullable(),
    id: z.string(),
    timestamp: z.string().nullable(),
    token: z.string().nullable(),
    txHash: z.string().nullable(),
    txLabel: z.string().nullable(),
  });
}
