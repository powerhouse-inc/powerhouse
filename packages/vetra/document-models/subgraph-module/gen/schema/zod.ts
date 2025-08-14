import { z } from "zod";
import type { SetSubgraphNameInput, SubgraphModuleState } from "./types.js";

type Properties<T> = Required<{
  [K in keyof T]: z.ZodType<T[K], any, T[K]>;
}>;

type definedNonNullAny = {};

export const isDefinedNonNullAny = (v: any): v is definedNonNullAny =>
  v !== undefined && v !== null;

export const definedNonNullAnySchema = z
  .any()
  .refine((v) => isDefinedNonNullAny(v));

export function SetSubgraphNameInputSchema(): z.ZodObject<
  Properties<SetSubgraphNameInput>
> {
  return z.object({
    name: z.string(),
  });
}

export function SubgraphModuleStateSchema(): z.ZodObject<
  Properties<SubgraphModuleState>
> {
  return z.object({
    __typename: z.literal("SubgraphModuleState").optional(),
    name: z.string(),
  });
}
