import { utils } from "document-model/document";
import {
  z,
  AddFileInput,
  AddFolderInput,
  DeleteNodeInput,
  UpdateFileInput,
  UpdateNodeInput,
  CopyNodeInput,
  MoveNodeInput,
} from "../types";
import {
  AddFileAction,
  AddFolderAction,
  DeleteNodeAction,
  UpdateFileAction,
  UpdateNodeAction,
  CopyNodeAction,
  MoveNodeAction,
} from "./actions";

const { createAction } = utils;

export const addFile = (input: AddFileInput) =>
  createAction<AddFileAction>(
    "ADD_FILE",
    { ...input },
    undefined,
    z.AddFileInputSchema,
    "global",
  );

export const addFolder = (input: AddFolderInput) =>
  createAction<AddFolderAction>(
    "ADD_FOLDER",
    { ...input },
    undefined,
    z.AddFolderInputSchema,
    "global",
  );

export const deleteNode = (input: DeleteNodeInput) =>
  createAction<DeleteNodeAction>(
    "DELETE_NODE",
    { ...input },
    undefined,
    z.DeleteNodeInputSchema,
    "global",
  );

export const updateFile = (input: UpdateFileInput) =>
  createAction<UpdateFileAction>(
    "UPDATE_FILE",
    { ...input },
    undefined,
    z.UpdateFileInputSchema,
    "global",
  );

export const updateNode = (input: UpdateNodeInput) =>
  createAction<UpdateNodeAction>(
    "UPDATE_NODE",
    { ...input },
    undefined,
    z.UpdateNodeInputSchema,
    "global",
  );

export const copyNode = (input: CopyNodeInput) =>
  createAction<CopyNodeAction>(
    "COPY_NODE",
    { ...input },
    undefined,
    z.CopyNodeInputSchema,
    "global",
  );

export const moveNode = (input: MoveNodeInput) =>
  createAction<MoveNodeAction>(
    "MOVE_NODE",
    { ...input },
    undefined,
    z.MoveNodeInputSchema,
    "global",
  );
