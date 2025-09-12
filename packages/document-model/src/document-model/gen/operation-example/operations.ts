import type {
  AddOperationExampleAction,
  DeleteOperationExampleAction,
  DocumentModelGlobalState,
  ReorderOperationExamplesAction,
  UpdateOperationExampleAction,
} from "document-model";

export interface DocumentModelOperationExampleOperations {
  addOperationExampleOperation: (
    state: DocumentModelGlobalState,
    action: AddOperationExampleAction,
  ) => void;
  updateOperationExampleOperation: (
    state: DocumentModelGlobalState,
    action: UpdateOperationExampleAction,
  ) => void;
  deleteOperationExampleOperation: (
    state: DocumentModelGlobalState,
    action: DeleteOperationExampleAction,
  ) => void;
  reorderOperationExamplesOperation: (
    state: DocumentModelGlobalState,
    action: ReorderOperationExamplesAction,
  ) => void;
}
