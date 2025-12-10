// TODO: remove eslint-disable rules once refactor is done
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { StateReducer } from "document-model";
import { isDocumentAction, createReducer } from "document-model/core";
import type { ToDoDocumentPHState } from "connect-e2e/document-models/to-do-document";

import { toDoDocumentBaseOperationsOperations } from "../src/reducers/base-operations.js";

import {
  AddTodoItemInputInputSchema,
  UpdateTodoItemInputInputSchema,
  DeleteTodoItemInputInputSchema,
} from "./schema/zod.js";

const stateReducer: StateReducer<ToDoDocumentPHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }

  switch (action.type) {
    case "ADD_TODO_ITEM_INPUT":
      AddTodoItemInputInputSchema().parse(action.input);
      toDoDocumentBaseOperationsOperations.addTodoItemInputOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;

    case "UPDATE_TODO_ITEM_INPUT":
      UpdateTodoItemInputInputSchema().parse(action.input);
      toDoDocumentBaseOperationsOperations.updateTodoItemInputOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;

    case "DELETE_TODO_ITEM_INPUT":
      DeleteTodoItemInputInputSchema().parse(action.input);
      toDoDocumentBaseOperationsOperations.deleteTodoItemInputOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;

    default:
      return state;
  }
};

export const reducer = createReducer<ToDoDocumentPHState>(stateReducer);
