import { z } from "zod";
import type {
  AddDocumentTypeInput,
  DocumentEditorState,
  DocumentTypeItem,
  RemoveDocumentTypeInput,
  SetEditorNameInput,
  SetEditorStatusInput,
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
    id: z.string(),
  });
}

export function DocumentEditorStateSchema(): z.ZodObject<
  Properties<DocumentEditorState>
> {
  return z.object({
    __typename: z.literal("DocumentEditorState").optional(),
    documentTypes: z.array(DocumentTypeItemSchema()),
    name: z.string(),
    status: StatusTypeSchema,
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

export function RemoveDocumentTypeInputSchema(): z.ZodObject<
  Properties<RemoveDocumentTypeInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function SetEditorNameInputSchema(): z.ZodObject<
  Properties<SetEditorNameInput>
> {
  return z.object({
    name: z.string(),
  });
}

export function SetEditorStatusInputSchema(): z.ZodObject<
  Properties<SetEditorStatusInput>
> {
  return z.object({
    status: StatusTypeSchema,
  });
}
