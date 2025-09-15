import { z } from "zod";
import type {
  SetSubgraphNameInput,
  SetSubgraphStatusInput,
  SubgraphModuleState,
} from "./types.js";
import { StatusType } from "./types.js";

type Properties<T> = Required<{
  [K in keyof T]: z.ZodType<T[K], any, T[K]>;
}>;

type definedNonNullAny = {};

export const isDefinedNonNullAny = (v: any): v is definedNonNullAny =>
  v !== undefined && v !== null;

export const definedNonNullAnySchema = z
  .any()
  .refine((v) => isDefinedNonNullAny(v));

export const StatusTypeSchema = z.enum(["CONFIRMED", "DRAFT"]);

export function SetSubgraphNameInputSchema(): z.ZodObject<
  Properties<SetSubgraphNameInput>
> {
  return z.object({
    name: z.string(),
  });
}

export function SetSubgraphStatusInputSchema(): z.ZodObject<
  Properties<SetSubgraphStatusInput>
> {
  return z.object({
    status: StatusTypeSchema,
  });
}

export function SubgraphModuleStateSchema(): z.ZodObject<
  Properties<SubgraphModuleState>
> {
  return z.object({
    __typename: z.literal("SubgraphModuleState").optional(),
    name: z.string(),
    status: StatusTypeSchema,
  });
}
