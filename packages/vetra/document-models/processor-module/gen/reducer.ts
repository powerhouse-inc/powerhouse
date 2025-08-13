// TODO: remove eslint-disable rules once refactor is done
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  type StateReducer,
  isDocumentAction,
  createReducer,
} from "document-model";
import { type ProcessorModuleDocument, z } from "./types.js";

import { reducer as BaseOperationsReducer } from "../src/reducers/base-operations.js";

const stateReducer: StateReducer<ProcessorModuleDocument> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }

  switch (action.type) {
    case "SET_PROCESSOR_NAME":
      z.SetProcessorNameInputSchema().parse(action.input);
      BaseOperationsReducer.setProcessorNameOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_PROCESSOR_TYPE":
      z.SetProcessorTypeInputSchema().parse(action.input);
      BaseOperationsReducer.setProcessorTypeOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;

    case "ADD_DOCUMENT_TYPE":
      z.AddDocumentTypeInputSchema().parse(action.input);
      BaseOperationsReducer.addDocumentTypeOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;

    case "REMOVE_DOCUMENT_TYPE":
      z.RemoveDocumentTypeInputSchema().parse(action.input);
      BaseOperationsReducer.removeDocumentTypeOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;

    default:
      return state;
  }
};

export const reducer = createReducer<ProcessorModuleDocument>(stateReducer);
