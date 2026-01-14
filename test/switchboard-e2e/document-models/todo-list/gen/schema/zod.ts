import * as z from "zod";
import type {
  AddTodoItemInput,
  DeleteTodoItemInput,
  TodoItem,
  TodoListState,
  UpdateTodoItemInput,
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

export function AddTodoItemInputSchema(): z.ZodObject<
  Properties<AddTodoItemInput>
> {
  return z.object({
    text: z.string(),
  });
}

export function DeleteTodoItemInputSchema(): z.ZodObject<
  Properties<DeleteTodoItemInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function TodoItemSchema(): z.ZodObject<Properties<TodoItem>> {
  return z.object({
    __typename: z.literal("TodoItem").optional(),
    checked: z.boolean(),
    id: z.string(),
    text: z.string(),
  });
}

export function TodoListStateSchema(): z.ZodObject<Properties<TodoListState>> {
  return z.object({
    __typename: z.literal("TodoListState").optional(),
    items: z.array(z.lazy(() => TodoItemSchema())),
  });
}

export function UpdateTodoItemInputSchema(): z.ZodObject<
  Properties<UpdateTodoItemInput>
> {
  return z.object({
    checked: z.boolean().nullish(),
    id: z.string(),
    text: z.string().nullish(),
  });
}
