import type {
  AddFileAction,
  AddFolderAction,
  CopyNodeAction,
  DeleteNodeAction,
  MoveNodeAction,
  UpdateFileAction,
  UpdateNodeAction,
} from "document-drive";
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
import {
  AddFileInputSchema,
  AddFolderInputSchema,
  CopyNodeInputSchema,
  DeleteNodeInputSchema,
  MoveNodeInputSchema,
  UpdateFileInputSchema,
  UpdateNodeInputSchema,
} from "document-drive";
import { createAction } from "document-model";

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
    AddFileInputSchema,
    "global",
  );
}

export const addFolder = (input: AddFolderInput) =>
  createAction<AddFolderAction>(
    "ADD_FOLDER",
    { ...input },
    undefined,
    AddFolderInputSchema,
    "global",
  );

export const deleteNode = (input: DeleteNodeInput) =>
  createAction<DeleteNodeAction>(
    "DELETE_NODE",
    { ...input },
    undefined,
    DeleteNodeInputSchema,
    "global",
  );

export const updateFile = (input: UpdateFileInput) =>
  createAction<UpdateFileAction>(
    "UPDATE_FILE",
    { ...input },
    undefined,
    UpdateFileInputSchema,
    "global",
  );

export const updateNode = (input: UpdateNodeInput) =>
  createAction<UpdateNodeAction>(
    "UPDATE_NODE",
    { ...input },
    undefined,
    UpdateNodeInputSchema,
    "global",
  );

export const copyNode = (input: CopyNodeInput) =>
  createAction<CopyNodeAction>(
    "COPY_NODE",
    { ...input },
    undefined,
    CopyNodeInputSchema,
    "global",
  );

export const moveNode = (input: MoveNodeInput) =>
  createAction<MoveNodeAction>(
    "MOVE_NODE",
    { ...input },
    undefined,
    MoveNodeInputSchema,
    "global",
  );
