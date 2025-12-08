// TODO: remove eslint-disable rules once refactor is done
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { StateReducer } from "document-model";
import { isDocumentAction, createReducer } from "document-model/core";
import type { TestDocPHState } from "test/document-models/test-doc/v2";

import { testDocBaseOperationsOperations } from "../src/reducers/base-operations.js";

import {
  SetTestIdInputSchema,
  SetTestIdButDifferentInputSchema,
  SetTestNameInputSchema,
} from "./schema/zod.js";

const stateReducer: StateReducer<TestDocPHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "SET_TEST_ID": {
      SetTestIdInputSchema().parse(action.input);

      testDocBaseOperationsOperations.setTestIdOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_TEST_ID_BUT_DIFFERENT": {
      SetTestIdButDifferentInputSchema().parse(action.input);

      testDocBaseOperationsOperations.setTestIdButDifferentOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_TEST_NAME": {
      SetTestNameInputSchema().parse(action.input);

      testDocBaseOperationsOperations.setTestNameOperation(
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

export const reducer = createReducer<TestDocPHState>(stateReducer);
