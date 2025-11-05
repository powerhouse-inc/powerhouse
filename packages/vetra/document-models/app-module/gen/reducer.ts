// TODO: remove eslint-disable rules once refactor is done
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { StateReducer } from "document-model";
import { isDocumentAction, createReducer } from "document-model/core";
import type { AppModulePHState } from "@powerhousedao/vetra/document-models/app-module";

import { appModuleBaseOperationsOperations } from "../src/reducers/base-operations.js";
import { appModuleDndOperationsOperations } from "../src/reducers/dnd-operations.js";

import {
  SetAppNameInputSchema,
  SetAppStatusInputSchema,
  AddDocumentTypeInputSchema,
  RemoveDocumentTypeInputSchema,
  SetDocumentTypesInputSchema,
  SetDragAndDropEnabledInputSchema,
} from "./schema/zod.js";

const stateReducer: StateReducer<AppModulePHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }

  switch (action.type) {
    case "SET_APP_NAME":
      SetAppNameInputSchema().parse(action.input);
      appModuleBaseOperationsOperations.setAppNameOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_APP_STATUS":
      SetAppStatusInputSchema().parse(action.input);
      appModuleBaseOperationsOperations.setAppStatusOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;

    case "ADD_DOCUMENT_TYPE":
      AddDocumentTypeInputSchema().parse(action.input);
      appModuleBaseOperationsOperations.addDocumentTypeOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;

    case "REMOVE_DOCUMENT_TYPE":
      RemoveDocumentTypeInputSchema().parse(action.input);
      appModuleBaseOperationsOperations.removeDocumentTypeOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_DOCUMENT_TYPES":
      SetDocumentTypesInputSchema().parse(action.input);
      appModuleBaseOperationsOperations.setDocumentTypesOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_DRAG_AND_DROP_ENABLED":
      SetDragAndDropEnabledInputSchema().parse(action.input);
      appModuleDndOperationsOperations.setDragAndDropEnabledOperation(
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
