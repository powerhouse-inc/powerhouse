// TODO: remove eslint-disable rules once refactor is done
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { StateReducer } from "document-model";
import { isDocumentAction, createReducer } from "document-model/core";
import type { DocumentEditorPHState } from "@powerhousedao/vetra/document-models/document-editor";

import { documentEditorBaseOperationsOperations } from "../src/reducers/base-operations.js";

import {
  SetEditorNameInputSchema,
  AddDocumentTypeInputSchema,
  RemoveDocumentTypeInputSchema,
  SetEditorStatusInputSchema,
} from "./schema/zod.js";

const stateReducer: StateReducer<DocumentEditorPHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "SET_EDITOR_NAME": {
      SetEditorNameInputSchema().parse(action.input);

      documentEditorBaseOperationsOperations.setEditorNameOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_DOCUMENT_TYPE": {
      AddDocumentTypeInputSchema().parse(action.input);

      documentEditorBaseOperationsOperations.addDocumentTypeOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_DOCUMENT_TYPE": {
      RemoveDocumentTypeInputSchema().parse(action.input);

      documentEditorBaseOperationsOperations.removeDocumentTypeOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_EDITOR_STATUS": {
      SetEditorStatusInputSchema().parse(action.input);

      documentEditorBaseOperationsOperations.setEditorStatusOperation(
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

export const reducer = createReducer<DocumentEditorPHState>(stateReducer);
