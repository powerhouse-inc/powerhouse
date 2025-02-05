import { z } from "zod";
import { OperationScope } from "@document/types.js";
import {
  Action,
  DocumentFile,
  LoadStateAction,
  LoadStateActionInput,
  LoadStateActionStateInput,
  Operation,
  PruneAction,
  PruneActionInput,
  RedoAction,
  SetNameAction,
  SetNameOperation,
  UndoAction,
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

export function ActionSchema(): z.ZodObject<Properties<Action>> {
  return z.object({
    __typename: z.literal("Action").optional(),
    type: z.string(),
  });
}

export function OperationScopeSchema(): z.ZodType<OperationScope> {
  return z.literal("global").or(z.literal("local"));
}

export function BaseActionSchema() {
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
  Properties<LoadStateAction>
> {
  return z.object({
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

export function OperationSchema(): z.ZodObject<Properties<Operation>> {
  return z.object({
    __typename: z.literal("Operation").optional(),
    hash: z.string(),
    index: z.number(),
    timestamp: z.string().datetime(),
    type: z.string(),
  });
}

export function PruneActionSchema(): z.ZodObject<Properties<PruneAction>> {
  return z.object({
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

export function RedoActionSchema(): z.ZodObject<Properties<RedoAction>> {
  return z.object({
    input: RedoActionInputSchema(),
    type: RedoSchema,
    scope: OperationScopeSchema(),
  });
}

export const SetNameActionInputSchema = z.string;

export function SetNameActionSchema(): z.ZodObject<Properties<SetNameAction>> {
  return z.object({
    input: SetNameActionInputSchema(),
    type: Set_NameSchema,
    scope: z.literal("global"),
  });
}

export function SetNameOperationSchema(): z.ZodObject<
  Properties<SetNameOperation>
> {
  return z.object({
    __typename: z.literal("SetNameOperation").optional(),
    hash: z.string(),
    index: z.number(),
    input: z.string(),
    timestamp: z.string().datetime(),
    type: z.string(),
  });
}

export const UndoActionInputSchema = z.number;

export function UndoActionSchema(): z.ZodObject<Properties<UndoAction>> {
  return z.object({
    input: UndoActionInputSchema(),
    type: UndoSchema,
    scope: OperationScopeSchema(),
  });
}
