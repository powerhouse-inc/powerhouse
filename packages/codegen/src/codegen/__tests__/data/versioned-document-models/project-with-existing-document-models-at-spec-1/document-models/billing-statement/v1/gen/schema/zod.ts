import { z } from 'zod'
import type { AddLineItemInput, BillingStatementLineItem, BillingStatementState, BillingStatementStatus, BillingStatementStatusInput, BillingStatementTag, BillingStatementUnit, BillingStatementUnitInput, EditBillingStatementInput, EditBillingStatementTestInput, EditContributorInput, EditLineItemInput, EditLineItemTagInput, EditStatusInput } from './types.js'

type Properties<T> = Required<{
  [K in keyof T]: z.ZodType<T[K], any, T[K]>;
}>;

type definedNonNullAny = {};

export const isDefinedNonNullAny = (v: any): v is definedNonNullAny => v !== undefined && v !== null;

export const definedNonNullAnySchema = z.any().refine((v) => isDefinedNonNullAny(v));

export const BillingStatementStatusSchema = z.enum(['ACCEPTED', 'DRAFT', 'ISSUED', 'PAID', 'REJECTED']);

export const BillingStatementStatusInputSchema = z.enum(['ACCEPTED', 'DRAFT', 'ISSUED', 'PAID', 'REJECTED']);

export const BillingStatementUnitSchema = z.enum(['DAY', 'HOUR', 'MINUTE', 'UNIT']);

export const BillingStatementUnitInputSchema = z.enum(['DAY', 'HOUR', 'MINUTE', 'UNIT']);

export function AddLineItemInputSchema(): z.ZodObject<Properties<AddLineItemInput>> {
  return z.object({
    description: z.string(),
    id: z.string(),
    quantity: z.number(),
    totalPriceCash: z.number(),
    totalPricePwt: z.number(),
    unit: BillingStatementUnitInputSchema,
    unitPriceCash: z.number(),
    unitPricePwt: z.number()
  })
}

export function BillingStatementLineItemSchema(): z.ZodObject<Properties<BillingStatementLineItem>> {
  return z.object({
    __typename: z.literal('BillingStatementLineItem').optional(),
    description: z.string(),
    id: z.string(),
    lineItemTag: z.array(z.lazy(() => BillingStatementTagSchema())),
    quantity: z.number(),
    totalPriceCash: z.number(),
    totalPricePwt: z.number(),
    unit: BillingStatementUnitSchema,
    unitPriceCash: z.number(),
    unitPricePwt: z.number()
  })
}

export function BillingStatementStateSchema(): z.ZodObject<Properties<BillingStatementState>> {
  return z.object({
    __typename: z.literal('BillingStatementState').optional(),
    contributor: z.string().nullish(),
    currency: z.string(),
    dateDue: z.string().datetime().nullish(),
    dateIssued: z.string().datetime(),
    lineItems: z.array(z.lazy(() => BillingStatementLineItemSchema())),
    notes: z.string().nullish(),
    status: BillingStatementStatusSchema,
    totalCash: z.number(),
    totalPowt: z.number()
  })
}

export function BillingStatementTagSchema(): z.ZodObject<Properties<BillingStatementTag>> {
  return z.object({
    __typename: z.literal('BillingStatementTag').optional(),
    dimension: z.string(),
    label: z.string().nullish(),
    value: z.string()
  })
}

export function EditBillingStatementInputSchema(): z.ZodObject<Properties<EditBillingStatementInput>> {
  return z.object({
    currency: z.string().nullish(),
    dateDue: z.string().datetime().nullish(),
    dateIssued: z.string().datetime().nullish(),
    notes: z.string().nullish()
  })
}

export function EditBillingStatementTestInputSchema(): z.ZodObject<Properties<EditBillingStatementTestInput>> {
  return z.object({
    test: z.string()
  })
}

export function EditContributorInputSchema(): z.ZodObject<Properties<EditContributorInput>> {
  return z.object({
    contributor: z.string()
  })
}

export function EditLineItemInputSchema(): z.ZodObject<Properties<EditLineItemInput>> {
  return z.object({
    description: z.string().nullish(),
    id: z.string(),
    quantity: z.number().nullish(),
    totalPriceCash: z.number().nullish(),
    totalPricePwt: z.number().nullish(),
    unit: BillingStatementUnitInputSchema.nullish(),
    unitPriceCash: z.number().nullish(),
    unitPricePwt: z.number().nullish()
  })
}

export function EditLineItemTagInputSchema(): z.ZodObject<Properties<EditLineItemTagInput>> {
  return z.object({
    dimension: z.string(),
    label: z.string().nullish(),
    lineItemId: z.string(),
    value: z.string()
  })
}

export function EditStatusInputSchema(): z.ZodObject<Properties<EditStatusInput>> {
  return z.object({
    status: BillingStatementStatusInputSchema
  })
}
