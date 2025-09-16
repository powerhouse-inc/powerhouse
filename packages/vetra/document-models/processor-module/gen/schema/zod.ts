import { z } from "zod";
import type {
  AddDocumentTypeInput,
  DocumentTypeItem,
  ProcessorModuleState,
  RemoveDocumentTypeInput,
  SetProcessorNameInput,
  SetProcessorStatusInput,
  SetProcessorTypeInput,
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
    id: z.string(),
  });
}

export function DocumentTypeItemSchema(): z.ZodObject<
  Properties<DocumentTypeItem>
> {
  return z.object({
    __typename: z.literal("DocumentTypeItem").optional(),
    documentType: z.string(),
    id: z.string(),
  });
}

export function ProcessorModuleStateSchema(): z.ZodObject<
  Properties<ProcessorModuleState>
> {
  return z.object({
    __typename: z.literal("ProcessorModuleState").optional(),
    documentTypes: z.array(DocumentTypeItemSchema()),
    name: z.string(),
    status: StatusTypeSchema,
    type: z.string(),
  });
}

export function RemoveDocumentTypeInputSchema(): z.ZodObject<
  Properties<RemoveDocumentTypeInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function SetProcessorNameInputSchema(): z.ZodObject<
  Properties<SetProcessorNameInput>
> {
  return z.object({
    name: z.string(),
  });
}

export function SetProcessorStatusInputSchema(): z.ZodObject<
  Properties<SetProcessorStatusInput>
> {
  return z.object({
    status: StatusTypeSchema,
  });
}

export function SetProcessorTypeInputSchema(): z.ZodObject<
  Properties<SetProcessorTypeInput>
> {
  return z.object({
    type: z.string(),
  });
}
