import type {
  AddFileInput,
  AddFolderInput,
  CopyNodeInput,
  DeleteNodeInput,
  LegacyAddFileAction,
  LegacyAddFileInput,
  MoveNodeInput,
  UpdateFileInput,
  UpdateNodeInput,
} from "document-drive";
import { documentDriveSchemas } from "document-drive";
import { createAction } from "document-model";
import type {
  AddFileAction,
  AddFolderAction,
  CopyNodeAction,
  DeleteNodeAction,
  MoveNodeAction,
  UpdateFileAction,
  UpdateNodeAction,
} from "document-drive";

/**
 * @deprecated Use addFile with {@link AddFileInput} instead. This overload will be removed in the future.
 */
export function addFile(input: LegacyAddFileInput): LegacyAddFileAction;
export function addFile(input: AddFileInput): AddFileAction;
export function addFile(
  input: LegacyAddFileInput | AddFileInput,
): typeof input extends LegacyAddFileInput
  ? LegacyAddFileAction
  : AddFileAction {
  if (input && typeof input === "object" && "synchronizationUnits" in input) {
    // Legacy overload
    return createAction<AddFileAction>(
      "ADD_FILE",
      { ...input },
      undefined,
      undefined,
      "global",
    );
  }
  // Standard overload
  return createAction<AddFileAction>(
    "ADD_FILE",
    { ...input },
    undefined,
    documentDriveSchemas.AddFileInputSchema,
    "global",
  );
}

export const addFolder = (input: AddFolderInput) =>
  createAction<AddFolderAction>(
    "ADD_FOLDER",
    { ...input },
    undefined,
    documentDriveSchemas.AddFolderInputSchema,
    "global",
  );

export const deleteNode = (input: DeleteNodeInput) =>
  createAction<DeleteNodeAction>(
    "DELETE_NODE",
    { ...input },
    undefined,
    documentDriveSchemas.DeleteNodeInputSchema,
    "global",
  );

export const updateFile = (input: UpdateFileInput) =>
  createAction<UpdateFileAction>(
    "UPDATE_FILE",
    { ...input },
    undefined,
    documentDriveSchemas.UpdateFileInputSchema,
    "global",
  );

export const updateNode = (input: UpdateNodeInput) =>
  createAction<UpdateNodeAction>(
    "UPDATE_NODE",
    { ...input },
    undefined,
    documentDriveSchemas.UpdateNodeInputSchema,
    "global",
  );

export const copyNode = (input: CopyNodeInput) =>
  createAction<CopyNodeAction>(
    "COPY_NODE",
    { ...input },
    undefined,
    documentDriveSchemas.CopyNodeInputSchema,
    "global",
  );

export const moveNode = (input: MoveNodeInput) =>
  createAction<MoveNodeAction>(
    "MOVE_NODE",
    { ...input },
    undefined,
    documentDriveSchemas.MoveNodeInputSchema,
    "global",
  );
