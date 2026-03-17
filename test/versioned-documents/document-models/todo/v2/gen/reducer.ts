// TODO: remove eslint-disable rules once refactor is done

import type { Reducer, StateReducer } from "document-model";
import { createReducer, isDocumentAction } from "document-model";
import type { TodoPHState } from "document-models/todo/v2";

import { todoTodoOperationsOperations } from "../src/reducers/todo-operations.js";

import {
  AddTodoInputSchema,
  EditTitleInputSchema,
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

    case "EDIT_TITLE": {
      EditTitleInputSchema().parse(action.input);

      todoTodoOperationsOperations.editTitleOperation(
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

export const reducer: Reducer<TodoPHState> = createReducer(stateReducer);
