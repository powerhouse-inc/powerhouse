import { z } from "zod";
import type {
  AddDocumentTypeInput,
  DocumentEditorState,
  DocumentTypeItem,
  RemoveDocumentTypeInput,
  SetEditorIdInput,
  SetEditorNameInput,
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
    id: z.string().nullable(),
    name: z.string().nullable(),
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

export function SetEditorIdInputSchema(): z.ZodObject<
  Properties<SetEditorIdInput>
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
