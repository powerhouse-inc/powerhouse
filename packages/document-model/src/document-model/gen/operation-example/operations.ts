import type {
  AddOperationExampleAction,
  DeleteOperationExampleAction,
  DocumentModelState,
  ReorderOperationExamplesAction,
  UpdateOperationExampleAction,
} from "document-model";

export interface DocumentModelOperationExampleOperations {
  addOperationExampleOperation: (
    state: DocumentModelState,
    action: AddOperationExampleAction,
  ) => void;
  updateOperationExampleOperation: (
    state: DocumentModelState,
    action: UpdateOperationExampleAction,
  ) => void;
  deleteOperationExampleOperation: (
    state: DocumentModelState,
    action: DeleteOperationExampleAction,
  ) => void;
  reorderOperationExamplesOperation: (
    state: DocumentModelState,
    action: ReorderOperationExamplesAction,
  ) => void;
}
