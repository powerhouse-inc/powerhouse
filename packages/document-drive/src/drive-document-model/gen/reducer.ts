import type { DocumentDriveDocument } from "document-drive";
import {
  documentDriveSchemas,
  driveReducer,
  nodeReducer,
} from "document-drive";
import type { Reducer, StateReducer } from "document-model";
import { createReducer, isDocumentAction } from "document-model";

const driveStateReducer: StateReducer<DocumentDriveDocument> = (
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
      documentDriveSchemas.AddFileInputSchema().parse(typedAction.input);
      nodeReducer.addFileOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "ADD_FOLDER":
      documentDriveSchemas.AddFolderInputSchema().parse(typedAction.input);
      nodeReducer.addFolderOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "DELETE_NODE":
      documentDriveSchemas.DeleteNodeInputSchema().parse(typedAction.input);
      nodeReducer.deleteNodeOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "UPDATE_FILE":
      documentDriveSchemas.UpdateFileInputSchema().parse(typedAction.input);
      nodeReducer.updateFileOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "UPDATE_NODE":
      documentDriveSchemas.UpdateNodeInputSchema().parse(typedAction.input);
      nodeReducer.updateNodeOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "COPY_NODE":
      documentDriveSchemas.CopyNodeInputSchema().parse(typedAction.input);
      nodeReducer.copyNodeOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "MOVE_NODE":
      documentDriveSchemas.MoveNodeInputSchema().parse(typedAction.input);
      nodeReducer.moveNodeOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_DRIVE_NAME":
      documentDriveSchemas.SetDriveNameInputSchema().parse(typedAction.input);
      driveReducer.setDriveNameOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_DRIVE_ICON":
      documentDriveSchemas.SetDriveIconInputSchema().parse(typedAction.input);
      driveReducer.setDriveIconOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_SHARING_TYPE":
      documentDriveSchemas.SetSharingTypeInputSchema().parse(typedAction.input);
      driveReducer.setSharingTypeOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_AVAILABLE_OFFLINE":
      documentDriveSchemas
        .SetAvailableOfflineInputSchema()
        .parse(typedAction.input);
      driveReducer.setAvailableOfflineOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "ADD_LISTENER":
      documentDriveSchemas.AddListenerInputSchema().parse(typedAction.input);
      driveReducer.addListenerOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "REMOVE_LISTENER":
      documentDriveSchemas.RemoveListenerInputSchema().parse(typedAction.input);
      driveReducer.removeListenerOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "ADD_TRIGGER":
      documentDriveSchemas.AddTriggerInputSchema().parse(typedAction.input);
      driveReducer.addTriggerOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "REMOVE_TRIGGER":
      documentDriveSchemas.RemoveTriggerInputSchema().parse(typedAction.input);
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

export const driveDocumentReducer: Reducer<DocumentDriveDocument> =
  createReducer<DocumentDriveDocument>(driveStateReducer);
