// TODO: remove eslint-disable rules once refactor is done

import type { ProcessorModulePHState } from "@powerhousedao/vetra/document-models/processor-module";
import type {
  Reducer,
  StateReducer,
} from "@powerhousedao/shared/document-model";
import {
  createReducer,
  isDocumentAction,
} from "@powerhousedao/shared/document-model";

import { processorModuleBaseOperationsOperations } from "../src/reducers/base-operations.js";

import {
  AddDocumentTypeInputSchema,
  AddProcessorAppInputSchema,
  RemoveDocumentTypeInputSchema,
  RemoveProcessorAppInputSchema,
  SetProcessorNameInputSchema,
  SetProcessorStatusInputSchema,
  SetProcessorTypeInputSchema,
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

    case "ADD_PROCESSOR_APP": {
      AddProcessorAppInputSchema().parse(action.input);

      processorModuleBaseOperationsOperations.addProcessorAppOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_PROCESSOR_APP": {
      RemoveProcessorAppInputSchema().parse(action.input);

      processorModuleBaseOperationsOperations.removeProcessorAppOperation(
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

export const reducer: Reducer<ProcessorModulePHState> =
  createReducer(stateReducer);
