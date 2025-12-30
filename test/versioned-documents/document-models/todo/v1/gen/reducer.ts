// TODO: remove eslint-disable rules once refactor is done
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { StateReducer } from "document-model";
import { isDocumentAction, createReducer } from "document-model/core";
import type { TodoPHState } from "versioned-documents/document-models/todo/v1";

import { todoTodoOperationsOperations } from "../src/reducers/todo-operations.js";

import {
  AddTodoInputSchema,
  RemoveTodoInputSchema,
  UpdateTodoInputSchema,
} from "./schema/zod.js";

const stateReducer: StateReducer<TodoPHState> = (state, action, dispatch) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "ADD_TODO": {
      AddTodoInputSchema().parse(action.input);

      todoTodoOperationsOperations.addTodoOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_TODO": {
      RemoveTodoInputSchema().parse(action.input);

      todoTodoOperationsOperations.removeTodoOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_TODO": {
      UpdateTodoInputSchema().parse(action.input);

      todoTodoOperationsOperations.updateTodoOperation(
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

export const reducer = createReducer<TodoPHState>(stateReducer);
