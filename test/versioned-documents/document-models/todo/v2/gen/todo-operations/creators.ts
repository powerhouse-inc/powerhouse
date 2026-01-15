import { createAction } from "document-model/core";
import {
  AddTodoInputSchema,
  RemoveTodoInputSchema,
  UpdateTodoInputSchema,
  EditTitleInputSchema,
} from "../schema/zod.js";
import type {
  AddTodoInput,
  RemoveTodoInput,
  UpdateTodoInput,
  EditTitleInput,
} from "../types.js";
import type {
  AddTodoAction,
  RemoveTodoAction,
  UpdateTodoAction,
  EditTitleAction,
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

export const editTitle = (input: EditTitleInput) =>
  createAction<EditTitleAction>(
    "EDIT_TITLE",
    { ...input },
    undefined,
    EditTitleInputSchema,
    "global",
  );
