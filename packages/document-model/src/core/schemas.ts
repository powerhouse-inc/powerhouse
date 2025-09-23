import { z } from "zod";
import type {
  DocumentFile,
  LoadStateActionInput,
  LoadStateActionStateInput,
  Operation,
  PruneActionInput,
  SchemaLoadStateAction,
  SchemaPruneAction,
  SchemaRedoAction,
  SchemaSetNameAction,
  SchemaUndoAction,
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

export const Load_StateSchema = z.enum(["LOAD_STATE"]);

export const PruneSchema = z.enum(["PRUNE"]);

export const RedoSchema = z.enum(["REDO"]);

export const Set_NameSchema = z.enum(["SET_NAME"]);

export const UndoSchema = z.enum(["UNDO"]);

export function OperationScopeSchema(): z.ZodString {
  return z.string();
}

export function DocumentActionSchema() {
  return z.union([
    LoadStateActionSchema(),
    PruneActionSchema(),
    RedoActionSchema(),
    SetNameActionSchema(),
    UndoActionSchema(),
  ]);
}

export function DocumentFileSchema(): z.ZodObject<Properties<DocumentFile>> {
  return z.object({
    __typename: z.literal("DocumentFile").optional(),
    data: z.string(),
    extension: z.string().nullable(),
    fileName: z.string().nullable(),
    mimeType: z.string(),
  });
}

export function LoadStateActionSchema(): z.ZodObject<
  Properties<SchemaLoadStateAction>
> {
  return z.object({
    id: z.string(),
    timestampUtcMs: z.string(),
    input: z.lazy(() => LoadStateActionInputSchema()),
    type: Load_StateSchema,
    scope: OperationScopeSchema(),
  });
}

export function LoadStateActionInputSchema(): z.ZodObject<
  Properties<LoadStateActionInput>
> {
  return z.object({
    operations: z.number(),
    state: z.lazy(() => LoadStateActionStateInputSchema()),
  });
}

export function LoadStateActionStateInputSchema(): z.ZodObject<
  Properties<LoadStateActionStateInput>
> {
  return z.object({
    data: z.unknown().nullish(),
    name: z.string(),
  });
}

export function PruneActionSchema(): z.ZodObject<
  Properties<SchemaPruneAction>
> {
  return z.object({
    id: z.string(),
    timestampUtcMs: z.string(),
    input: z.lazy(() => PruneActionInputSchema()),
    type: PruneSchema,
    scope: OperationScopeSchema(),
  });
}

export function PruneActionInputSchema(): z.ZodObject<
  Properties<PruneActionInput>
> {
  return z.object({
    end: z.number().nullish(),
    start: z.number().nullish(),
  });
}

export const RedoActionInputSchema = z.number;

export function RedoActionSchema(): z.ZodObject<Properties<SchemaRedoAction>> {
  return z.object({
    id: z.string(),
    timestampUtcMs: z.string().datetime(),
    input: RedoActionInputSchema(),
    type: RedoSchema,
    scope: OperationScopeSchema(),
  });
}

export const SetNameActionInputSchema = z.string;

export function SetNameActionSchema(): z.ZodObject<
  Properties<SchemaSetNameAction>
> {
  return z.object({
    id: z.string(),
    timestampUtcMs: z.string().datetime(),
    input: SetNameActionInputSchema(),
    type: Set_NameSchema,
    scope: z.literal("global"),
  });
}

// export function SetNameOperationSchema(): z.ZodObject<
//   Properties<SetNameOperation>
// > {
//   return z.object({
//     __typename: z.literal("SetNameOperation").optional(),
//     hash: z.string(),
//     index: z.number(),
//     input: z.string(),
//     timestampUtcMs: z.string().datetime(),
//     type: z.string(),
//   });
// }

export const UndoActionInputSchema = z.number;

export function UndoActionSchema(): z.ZodObject<Properties<SchemaUndoAction>> {
  return z.object({
    id: z.string(),
    timestampUtcMs: z.string().datetime(),
    input: UndoActionInputSchema(),
    type: UndoSchema,
    scope: OperationScopeSchema(),
  });
}
