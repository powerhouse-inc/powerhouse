// TODO: remove eslint-disable rules once refactor is done
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { StateReducer } from "document-model";
import { isDocumentAction, createReducer } from "document-model/core";
import type { TodoListPHState } from "@powerhousedao/todo-demo/document-models/todo-list";

import { todoListTodosOperations } from "../src/reducers/todos.js";

import {
  AddTodoItemInputSchema,
  UpdateTodoItemInputSchema,
  DeleteTodoItemInputSchema,
} from "./schema/zod.js";

const stateReducer: StateReducer<TodoListPHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "ADD_TODO_ITEM": {
      AddTodoItemInputSchema().parse(action.input);

      todoListTodosOperations.addTodoItemOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_TODO_ITEM": {
      UpdateTodoItemInputSchema().parse(action.input);

      todoListTodosOperations.updateTodoItemOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "DELETE_TODO_ITEM": {
      DeleteTodoItemInputSchema().parse(action.input);

      todoListTodosOperations.deleteTodoItemOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    default:
      return state;
  }
};

export const reducer = createReducer<TodoListPHState>(stateReducer);
