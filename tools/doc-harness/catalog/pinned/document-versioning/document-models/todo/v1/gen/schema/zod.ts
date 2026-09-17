/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as z from "zod";
import type {
  AddItemInput,
  CheckItemInput,
  TodoItem,
  TodoState,
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

export function AddItemInputSchema(): z.ZodObject<Properties<AddItemInput>> {
  return z.object({
    id: z.string(),
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

export function TodoItemSchema(): z.ZodObject<Properties<TodoItem>> {
  return z.object({
    __typename: z.literal("TodoItem").optional(),
    checked: z.boolean(),
    id: z.string(),
    title: z.string(),
  });
}

export function TodoStateSchema(): z.ZodObject<Properties<TodoState>> {
  return z.object({
    __typename: z.literal("TodoState").optional(),
    items: z.array(z.lazy(() => TodoItemSchema())),
  });
}
