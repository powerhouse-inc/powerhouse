import { createAction } from "document-model/core";
import {
  AddTodoItemInputInputSchema,
  UpdateTodoItemInputInputSchema,
  DeleteTodoItemInputInputSchema,
} from "../schema/zod.js";
import type {
  AddTodoItemInputInput,
  UpdateTodoItemInputInput,
  DeleteTodoItemInputInput,
} from "../types.js";
import type {
  AddTodoItemInputAction,
  UpdateTodoItemInputAction,
  DeleteTodoItemInputAction,
} from "./actions.js";

export const addTodoItemInput = (input: AddTodoItemInputInput) =>
  createAction<AddTodoItemInputAction>(
    "ADD_TODO_ITEM_INPUT",
    { ...input },
    undefined,
    AddTodoItemInputInputSchema,
    "global",
  );

export const updateTodoItemInput = (input: UpdateTodoItemInputInput) =>
  createAction<UpdateTodoItemInputAction>(
    "UPDATE_TODO_ITEM_INPUT",
    { ...input },
    undefined,
    UpdateTodoItemInputInputSchema,
    "global",
  );

export const deleteTodoItemInput = (input: DeleteTodoItemInputInput) =>
  createAction<DeleteTodoItemInputAction>(
    "DELETE_TODO_ITEM_INPUT",
    { ...input },
    undefined,
    DeleteTodoItemInputInputSchema,
    "global",
  );
