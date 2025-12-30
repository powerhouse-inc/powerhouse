import { createAction } from "document-model/core";
import {
  AddTodoInputSchema,
  RemoveTodoInputSchema,
  UpdateTodoInputSchema,
} from "../schema/zod.js";
import type {
  AddTodoInput,
  RemoveTodoInput,
  UpdateTodoInput,
} from "../types.js";
import type {
  AddTodoAction,
  RemoveTodoAction,
  UpdateTodoAction,
} from "./actions.js";

export const addTodo = (input: AddTodoInput) =>
  createAction<AddTodoAction>(
    "ADD_TODO",
    { ...input },
    undefined,
    AddTodoInputSchema,
    "global",
  );

export const removeTodo = (input: RemoveTodoInput) =>
  createAction<RemoveTodoAction>(
    "REMOVE_TODO",
    { ...input },
    undefined,
    RemoveTodoInputSchema,
    "global",
  );

export const updateTodo = (input: UpdateTodoInput) =>
  createAction<UpdateTodoAction>(
    "UPDATE_TODO",
    { ...input },
    undefined,
    UpdateTodoInputSchema,
    "global",
  );
