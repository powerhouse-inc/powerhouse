import * as z from "zod";
import type {
  AddTodoItemInputInput,
  DeleteTodoItemInputInput,
  ToDoDocumentState,
  ToDoItem,
  ToDoListStats,
  UpdateTodoItemInputInput,
} from "./types.js";

type Properties<T> = Required<{
  [K in keyof T]: z.ZodType<T[K]>;
}>;

type definedNonNullAny = {};

export const isDefinedNonNullAny = (v: any): v is definedNonNullAny =>
  v !== undefined && v !== null;

export const definedNonNullAnySchema = z
  .any()
  .refine((v) => isDefinedNonNullAny(v));

export function AddTodoItemInputInputSchema(): z.ZodObject<
  Properties<AddTodoItemInputInput>
> {
  return z.object({
    id: z.string(),
    text: z.string(),
  });
}

export function DeleteTodoItemInputInputSchema(): z.ZodObject<
  Properties<DeleteTodoItemInputInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function ToDoDocumentStateSchema(): z.ZodObject<
  Properties<ToDoDocumentState>
> {
  return z.object({
    __typename: z.literal("ToDoDocumentState").optional(),
    items: z.array(z.lazy(() => ToDoItemSchema())),
    stats: z.lazy(() => ToDoListStatsSchema()),
  });
}

export function ToDoItemSchema(): z.ZodObject<Properties<ToDoItem>> {
  return z.object({
    __typename: z.literal("ToDoItem").optional(),
    checked: z.boolean(),
    id: z.string(),
    text: z.string(),
  });
}

export function ToDoListStatsSchema(): z.ZodObject<Properties<ToDoListStats>> {
  return z.object({
    __typename: z.literal("ToDoListStats").optional(),
    checked: z.number(),
    total: z.number(),
    unchecked: z.number(),
  });
}

export function UpdateTodoItemInputInputSchema(): z.ZodObject<
  Properties<UpdateTodoItemInputInput>
> {
  return z.object({
    checked: z.boolean().nullish(),
    id: z.string(),
    text: z.string().nullish(),
  });
}
