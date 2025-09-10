import {
  AddChangeLogItemAction,
  UpdateChangeLogItemAction,
  DeleteChangeLogItemAction,
  ReorderChangeLogItemsAction,
  ReleaseNewVersionAction,
} from "./actions.js";
import { DocumentModelState } from "../types.js";

export interface DocumentModelVersioningOperations {
  addChangeLogItemOperation: (
    state: DocumentModelState,
    action: AddChangeLogItemAction,
  ) => void;
  updateChangeLogItemOperation: (
    state: DocumentModelState,
    action: UpdateChangeLogItemAction,
  ) => void;
  deleteChangeLogItemOperation: (
    state: DocumentModelState,
    action: DeleteChangeLogItemAction,
  ) => void;
  reorderChangeLogItemsOperation: (
    state: DocumentModelState,
    action: ReorderChangeLogItemsAction,
  ) => void;
  releaseNewVersionOperation: (
    state: DocumentModelState,
    action: ReleaseNewVersionAction,
  ) => void;
}
