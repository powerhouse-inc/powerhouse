import type { StateReducer } from "document-model";
import { isDocumentAction, createReducer } from "document-model";
import type { AppModuleDocument } from "./types.js";
import { z } from "./types.js";

import { reducer as BaseOperationsReducer } from "../src/reducers/base-operations.js";

export const stateReducer: StateReducer<AppModulePHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }

  switch (action.type) {
    case "SET_APP_NAME":
      z.SetAppNameInputSchema().parse(action.input);
      BaseOperationsReducer.setAppNameOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_APP_STATUS":
      z.SetAppStatusInputSchema().parse(action.input);
      BaseOperationsReducer.setAppStatusOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;

    default:
      return state;
  }
};

export const reducer = createReducer<AppModulePHState>(stateReducer);
