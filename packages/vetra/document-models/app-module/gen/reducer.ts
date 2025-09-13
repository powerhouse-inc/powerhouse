// TODO: remove eslint-disable rules once refactor is done
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  type StateReducer,
  isDocumentAction,
  createReducer,
} from "document-model";
import { AppModulePHState } from "./ph-factories.js";
import { z } from "./types.js";

import { reducer as BaseOperationsReducer } from "../src/reducers/base-operations.js";
import { reducer as DndOperationsReducer } from "../src/reducers/dnd-operations.js";

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

    case "SET_DRAG_AND_DROP_ENABLED":
      z.SetDragAndDropEnabledInputSchema().parse(action.input);
      DndOperationsReducer.setDragAndDropEnabledOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;

    case "ADD_DOCUMENT_TYPE":
      z.AddDocumentTypeInputSchema().parse(action.input);
      DndOperationsReducer.addDocumentTypeOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;

    case "REMOVE_DOCUMENT_TYPE":
      z.RemoveDocumentTypeInputSchema().parse(action.input);
      DndOperationsReducer.removeDocumentTypeOperation(
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
