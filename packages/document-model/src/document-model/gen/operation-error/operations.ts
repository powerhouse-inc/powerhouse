import {
  type AddOperationErrorAction,
  type SetOperationErrorCodeAction,
  type SetOperationErrorNameAction,
  type SetOperationErrorDescriptionAction,
  type SetOperationErrorTemplateAction,
  type DeleteOperationErrorAction,
  type ReorderOperationErrorsAction,
} from "./actions.js";
import { type DocumentModelState } from "../types.js";

export interface DocumentModelOperationErrorOperations {
  addOperationErrorOperation: (
    state: DocumentModelState,
    action: AddOperationErrorAction,
  ) => void;
  setOperationErrorCodeOperation: (
    state: DocumentModelState,
    action: SetOperationErrorCodeAction,
  ) => void;
  setOperationErrorNameOperation: (
    state: DocumentModelState,
    action: SetOperationErrorNameAction,
  ) => void;
  setOperationErrorDescriptionOperation: (
    state: DocumentModelState,
    action: SetOperationErrorDescriptionAction,
  ) => void;
  setOperationErrorTemplateOperation: (
    state: DocumentModelState,
    action: SetOperationErrorTemplateAction,
  ) => void;
  deleteOperationErrorOperation: (
    state: DocumentModelState,
    action: DeleteOperationErrorAction,
  ) => void;
  reorderOperationErrorsOperation: (
    state: DocumentModelState,
    action: ReorderOperationErrorsAction,
  ) => void;
}
