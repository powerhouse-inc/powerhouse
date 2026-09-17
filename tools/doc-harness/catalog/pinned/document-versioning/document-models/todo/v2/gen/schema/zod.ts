/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as z from "zod";
import type {
  AddItemInput,
  CheckItemInput,
  SetPriorityInput,
  SetStatusInput,
  TodoItem,
  TodoState,
  TodoStatus,
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

export const TodoStatusSchema = z.enum(["DONE", "IN_PROGRESS", "TODO"]);

export function AddItemInputSchema(): z.ZodObject<Properties<AddItemInput>> {
  return z.object({
    id: z.string(),
    priority: z.number().nullish(),
    title: z.string(),
  });
}

export function CheckItemInputSchema(): z.ZodObject<
  Properties<CheckItemInput>
> {
  return z.object({
    checked: z.boolean(),
    id: z.string(),
  });
}

export function SetPriorityInputSchema(): z.ZodObject<
  Properties<SetPriorityInput>
> {
  return z.object({
    id: z.string(),
    priority: z.number(),
  });
}

export function SetStatusInputSchema(): z.ZodObject<
  Properties<SetStatusInput>
> {
  return z.object({
    id: z.string(),
    status: TodoStatusSchema,
  });
}

export function TodoItemSchema(): z.ZodObject<Properties<TodoItem>> {
  return z.object({
    __typename: z.literal("TodoItem").optional(),
    id: z.string(),
    priority: z.number(),
    status: TodoStatusSchema,
    title: z.string(),
  });
}

export function TodoStateSchema(): z.ZodObject<Properties<TodoState>> {
  return z.object({
    __typename: z.literal("TodoState").optional(),
    items: z.array(z.lazy(() => TodoItemSchema())),
  });
}
