/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { Reducer, StateReducer } from "document-model";
import { createReducer, isDocumentAction } from "document-model";
import type { TodoPHState } from "document-models/todo/v1";

import { todoTodoOperations } from "../src/reducers/todo.js";

import { AddItemInputSchema, CheckItemInputSchema } from "./schema/zod.js";

const stateReducer: StateReducer<TodoPHState> = (state, action, dispatch) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "ADD_ITEM": {
      AddItemInputSchema().parse(action.input);

      todoTodoOperations.addItemOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CHECK_ITEM": {
      CheckItemInputSchema().parse(action.input);

      todoTodoOperations.checkItemOperation(
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
