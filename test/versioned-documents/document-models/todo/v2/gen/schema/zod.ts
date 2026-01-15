import * as z from "zod";
import type {
  AddTodoInput,
  EditTitleInput,
  RemoveTodoInput,
  Todo,
  TodoState,
  UpdateTodoInput,
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

export function AddTodoInputSchema(): z.ZodObject<Properties<AddTodoInput>> {
  return z.object({
    completed: z.boolean(),
    id: z.string(),
    title: z.string(),
  });
}

export function EditTitleInputSchema(): z.ZodObject<
  Properties<EditTitleInput>
> {
  return z.object({
    title: z.string().nullish(),
  });
}

export function RemoveTodoInputSchema(): z.ZodObject<
  Properties<RemoveTodoInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function TodoSchema(): z.ZodObject<Properties<Todo>> {
  return z.object({
    __typename: z.literal("Todo").optional(),
    completed: z.boolean(),
    id: z.string(),
    title: z.string(),
  });
}

export function TodoStateSchema(): z.ZodObject<Properties<TodoState>> {
  return z.object({
    __typename: z.literal("TodoState").optional(),
    title: z.string().nullish(),
    todos: z.array(z.lazy(() => TodoSchema())),
  });
}

export function UpdateTodoInputSchema(): z.ZodObject<
  Properties<UpdateTodoInput>
> {
  return z.object({
    completed: z.boolean().nullish(),
    id: z.string(),
    title: z.string().nullish(),
  });
}
