import { z } from "zod";
import type {
  AddDocumentTypeInput,
  AppModuleState,
  RemoveDocumentTypeInput,
  SetAppNameInput,
  SetAppStatusInput,
  SetDragAndDropEnabledInput,
  StatusType,
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

export function AddDocumentTypeInputSchema(): z.ZodObject<
  Properties<AddDocumentTypeInput>
> {
  return z.object({
    documentType: z.string(),
  });
}

export function AppModuleStateSchema(): z.ZodObject<
  Properties<AppModuleState>
> {
  return z.object({
    __typename: z.literal("AppModuleState").optional(),
    allowedDocumentTypes: z.array(z.string()).nullable(),
    isDragAndDropEnabled: z.boolean(),
    name: z.string(),
    status: StatusTypeSchema,
  });
}

export function RemoveDocumentTypeInputSchema(): z.ZodObject<
  Properties<RemoveDocumentTypeInput>
> {
  return z.object({
    documentType: z.string(),
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

export function SetDragAndDropEnabledInputSchema(): z.ZodObject<
  Properties<SetDragAndDropEnabledInput>
> {
  return z.object({
    enabled: z.boolean(),
  });
}
