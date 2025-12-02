// TODO: remove eslint-disable rules once refactor is done
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { StateReducer } from "document-model";
import { isDocumentAction, createReducer } from "document-model/core";
import type { ProcessorModulePHState } from "@powerhousedao/vetra/document-models/processor-module";

import { processorModuleBaseOperationsOperations } from "../src/reducers/base-operations.js";

import {
  SetProcessorNameInputSchema,
  SetProcessorTypeInputSchema,
  AddDocumentTypeInputSchema,
  RemoveDocumentTypeInputSchema,
  SetProcessorStatusInputSchema,
} from "./schema/zod.js";

const stateReducer: StateReducer<ProcessorModulePHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "SET_PROCESSOR_NAME": {
      SetProcessorNameInputSchema().parse(action.input);

      processorModuleBaseOperationsOperations.setProcessorNameOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_PROCESSOR_TYPE": {
      SetProcessorTypeInputSchema().parse(action.input);

      processorModuleBaseOperationsOperations.setProcessorTypeOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_DOCUMENT_TYPE": {
      AddDocumentTypeInputSchema().parse(action.input);

      processorModuleBaseOperationsOperations.addDocumentTypeOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_DOCUMENT_TYPE": {
      RemoveDocumentTypeInputSchema().parse(action.input);

      processorModuleBaseOperationsOperations.removeDocumentTypeOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_PROCESSOR_STATUS": {
      SetProcessorStatusInputSchema().parse(action.input);

      processorModuleBaseOperationsOperations.setProcessorStatusOperation(
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

export const reducer = createReducer<ProcessorModulePHState>(stateReducer);
