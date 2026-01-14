import { createAction } from "document-model/core";
import {
  AddTodoItemInputSchema,
  UpdateTodoItemInputSchema,
  DeleteTodoItemInputSchema,
} from "../schema/zod.js";
import type {
  AddTodoItemInput,
  UpdateTodoItemInput,
  DeleteTodoItemInput,
} from "../types.js";
import type {
  AddTodoItemAction,
  UpdateTodoItemAction,
  DeleteTodoItemAction,
} from "./actions.js";

export const addTodoItem = (input: AddTodoItemInput) =>
  createAction<AddTodoItemAction>(
    "ADD_TODO_ITEM",
    { ...input },
    undefined,
    AddTodoItemInputSchema,
    "global",
  );

export const updateTodoItem = (input: UpdateTodoItemInput) =>
  createAction<UpdateTodoItemAction>(
    "UPDATE_TODO_ITEM",
    { ...input },
    undefined,
    UpdateTodoItemInputSchema,
    "global",
  );

export const deleteTodoItem = (input: DeleteTodoItemInput) =>
  createAction<DeleteTodoItemAction>(
    "DELETE_TODO_ITEM",
    { ...input },
    undefined,
    DeleteTodoItemInputSchema,
    "global",
  );
