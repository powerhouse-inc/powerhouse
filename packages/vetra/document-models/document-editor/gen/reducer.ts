// TODO: remove eslint-disable rules once refactor is done
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { StateReducer } from "document-model";
import { isDocumentAction, createReducer } from "document-model/core";
import type { DocumentEditorPHState } from "./types.js";
import { z } from "./types.js";

import { reducer as BaseOperationsReducer } from "../src/reducers/base-operations.js";

export const stateReducer: StateReducer<DocumentEditorPHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }

  switch (action.type) {
    case "SET_EDITOR_NAME":
      z.SetEditorNameInputSchema().parse(action.input);
      BaseOperationsReducer.setEditorNameOperation(
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

    case "SET_EDITOR_STATUS":
      z.SetEditorStatusInputSchema().parse(action.input);
      BaseOperationsReducer.setEditorStatusOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;

    default:
      return state;
  }
};

export const reducer = createReducer<DocumentEditorPHState>(stateReducer);
