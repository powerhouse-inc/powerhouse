import { z } from "zod";
import type {
  AppModuleState,
  SetAppNameInput,
  SetAppStatusInput,
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

export const StatusTypeSchema = z.enum(["CONFIRMED", "DRAFT"]);

export function AppModuleStateSchema(): z.ZodObject<
  Properties<AppModuleState>
> {
  return z.object({
    __typename: z.literal("AppModuleState").optional(),
    name: z.string(),
    status: StatusTypeSchema,
  });
}

export function SetAppNameInputSchema(): z.ZodObject<
  Properties<SetAppNameInput>
> {
  return z.object({
    name: z.string(),
  });
}

export function SetAppStatusInputSchema(): z.ZodObject<
  Properties<SetAppStatusInput>
> {
  return z.object({
    status: StatusTypeSchema,
  });
}
