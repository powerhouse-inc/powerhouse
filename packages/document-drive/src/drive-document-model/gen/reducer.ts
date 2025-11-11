import type { Reducer, StateReducer } from "document-model";
import { createReducer, isDocumentAction } from "document-model/core";
import { driveReducer } from "../src/reducers/drive.js";
import { nodeReducer } from "../src/reducers/node.js";
import {
  AddFileInputSchema,
  AddFolderInputSchema,
  AddListenerInputSchema,
  AddTriggerInputSchema,
  CopyNodeInputSchema,
  DeleteNodeInputSchema,
  MoveNodeInputSchema,
  RemoveListenerInputSchema,
  RemoveTriggerInputSchema,
  SetAvailableOfflineInputSchema,
  SetDriveIconInputSchema,
  SetDriveNameInputSchema,
  SetSharingTypeInputSchema,
  UpdateFileInputSchema,
  UpdateNodeInputSchema,
} from "./schema/zod.js";
import type { DocumentDrivePHState } from "./types.js";

const driveStateReducer: StateReducer<DocumentDrivePHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }

  const typedAction = action as any;
  switch (typedAction.type) {
    case "ADD_FILE":
      AddFileInputSchema().parse(typedAction.input);
      nodeReducer.addFileOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "ADD_FOLDER":
      AddFolderInputSchema().parse(typedAction.input);
      nodeReducer.addFolderOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "DELETE_NODE":
      DeleteNodeInputSchema().parse(typedAction.input);
      nodeReducer.deleteNodeOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "UPDATE_FILE":
      UpdateFileInputSchema().parse(typedAction.input);
      nodeReducer.updateFileOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "UPDATE_NODE":
      UpdateNodeInputSchema().parse(typedAction.input);
      nodeReducer.updateNodeOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "COPY_NODE":
      CopyNodeInputSchema().parse(typedAction.input);
      nodeReducer.copyNodeOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "MOVE_NODE":
      MoveNodeInputSchema().parse(typedAction.input);
      nodeReducer.moveNodeOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_DRIVE_NAME":
      SetDriveNameInputSchema().parse(typedAction.input);
      driveReducer.setDriveNameOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_DRIVE_ICON":
      SetDriveIconInputSchema().parse(typedAction.input);
      driveReducer.setDriveIconOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_SHARING_TYPE":
      SetSharingTypeInputSchema().parse(typedAction.input);
      driveReducer.setSharingTypeOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_AVAILABLE_OFFLINE":
      SetAvailableOfflineInputSchema().parse(typedAction.input);
      driveReducer.setAvailableOfflineOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "ADD_LISTENER":
      AddListenerInputSchema().parse(typedAction.input);
      driveReducer.addListenerOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "REMOVE_LISTENER":
      RemoveListenerInputSchema().parse(typedAction.input);
      driveReducer.removeListenerOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "ADD_TRIGGER":
      AddTriggerInputSchema().parse(typedAction.input);
      driveReducer.addTriggerOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "REMOVE_TRIGGER":
      RemoveTriggerInputSchema().parse(typedAction.input);
      driveReducer.removeTriggerOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    default:
      return state;
  }
};

export const driveDocumentReducer: Reducer<DocumentDrivePHState> =
  createReducer<DocumentDrivePHState>(driveStateReducer);
