import type {
  AddChangeLogItemAction,
  DeleteChangeLogItemAction,
  DocumentModelGlobalState,
  ReleaseNewVersionAction,
  ReorderChangeLogItemsAction,
  UpdateChangeLogItemAction,
} from "document-model";

export interface DocumentModelVersioningOperations {
  addChangeLogItemOperation: (
    state: DocumentModelGlobalState,
    action: AddChangeLogItemAction,
  ) => void;
  updateChangeLogItemOperation: (
    state: DocumentModelGlobalState,
    action: UpdateChangeLogItemAction,
  ) => void;
  deleteChangeLogItemOperation: (
    state: DocumentModelGlobalState,
    action: DeleteChangeLogItemAction,
  ) => void;
  reorderChangeLogItemsOperation: (
    state: DocumentModelGlobalState,
    action: ReorderChangeLogItemsAction,
  ) => void;
  releaseNewVersionOperation: (
    state: DocumentModelGlobalState,
    action: ReleaseNewVersionAction,
  ) => void;
}
