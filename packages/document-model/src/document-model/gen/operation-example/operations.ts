import {
  type AddOperationExampleAction,
  type UpdateOperationExampleAction,
  type DeleteOperationExampleAction,
  type ReorderOperationExamplesAction,
} from "./actions.js";
import { type DocumentModelState } from "../types.js";

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
