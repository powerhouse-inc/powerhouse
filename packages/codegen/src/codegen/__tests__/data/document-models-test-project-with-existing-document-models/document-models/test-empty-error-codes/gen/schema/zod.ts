import * as z from "zod";
import type { SetValueInput, TestState } from "./types.js";

type Properties<T> = Required<{
  [K in keyof T]: z.ZodType<T[K]>;
}>;

type definedNonNullAny = {};

export const isDefinedNonNullAny = (v: any): v is definedNonNullAny =>
  v !== undefined && v !== null;

export const definedNonNullAnySchema = z
  .any()
  .refine((v) => isDefinedNonNullAny(v));

export function SetValueInputSchema(): z.ZodObject<Properties<SetValueInput>> {
  return z.object({
    value: z.string(),
  });
}

export function TestStateSchema(): z.ZodObject<Properties<TestState>> {
  return z.object({
    __typename: z.literal("TestState").optional(),
    value: z.string(),
  });
}
