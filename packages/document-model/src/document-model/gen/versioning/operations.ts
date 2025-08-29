import type {
  AddChangeLogItemAction,
  DeleteChangeLogItemAction,
  DocumentModelState,
  ReleaseNewVersionAction,
  ReorderChangeLogItemsAction,
  UpdateChangeLogItemAction,
} from "document-model";

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
