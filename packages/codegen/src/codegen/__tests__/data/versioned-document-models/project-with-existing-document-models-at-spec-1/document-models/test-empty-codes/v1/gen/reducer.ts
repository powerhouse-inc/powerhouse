// TODO: remove eslint-disable rules once refactor is done

import type { StateReducer } from "document-model";
import { isDocumentAction, createReducer } from "document-model/core";
import type { TestEmptyCodesPHState } from "test/document-models/test-empty-codes/v1";

import { testEmptyCodesTestOperationsOperations } from "../src/reducers/test-operations.js";

import { SetValueInputSchema } from "./schema/zod.js";

const stateReducer: StateReducer<TestEmptyCodesPHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "SET_VALUE": {
      SetValueInputSchema().parse(action.input);

      testEmptyCodesTestOperationsOperations.setValueOperation(
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

export const reducer = createReducer<TestEmptyCodesPHState>(stateReducer);
