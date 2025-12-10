import * as z from 'zod'
import type { SetTestIdButDifferentInput, SetTestIdInput, SetTestNameInput, TestDocState } from './types.js'

type Properties<T> = Required<{
  [K in keyof T]: z.ZodType<T[K]>;
}>;

type definedNonNullAny = {};

export const isDefinedNonNullAny = (v: any): v is definedNonNullAny => v !== undefined && v !== null;

export const definedNonNullAnySchema = z.any().refine((v) => isDefinedNonNullAny(v));

export function SetTestIdButDifferentInputSchema(): z.ZodObject<Properties<SetTestIdButDifferentInput>> {
  return z.object({
    id: z.string()
  })
}

export function SetTestIdInputSchema(): z.ZodObject<Properties<SetTestIdInput>> {
  return z.object({
    id: z.number()
  })
}

export function SetTestNameInputSchema(): z.ZodObject<Properties<SetTestNameInput>> {
  return z.object({
    name: z.string()
  })
}

export function TestDocStateSchema(): z.ZodObject<Properties<TestDocState>> {
  return z.object({
    __typename: z.literal('TestDocState').optional(),
    description: z.string().nullish(),
    id: z.number(),
    name: z.string(),
    value: z.string()
  })
}
