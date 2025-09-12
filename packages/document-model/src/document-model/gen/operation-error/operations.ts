import type { DocumentModelGlobalState } from "document-model";
import type {
  AddOperationErrorAction,
  DeleteOperationErrorAction,
  ReorderOperationErrorsAction,
  SetOperationErrorCodeAction,
  SetOperationErrorDescriptionAction,
  SetOperationErrorNameAction,
  SetOperationErrorTemplateAction,
} from "document-model";

export interface DocumentModelOperationErrorOperations {
  addOperationErrorOperation: (
    state: DocumentModelGlobalState,
    action: AddOperationErrorAction,
  ) => void;
  setOperationErrorCodeOperation: (
    state: DocumentModelGlobalState,
    action: SetOperationErrorCodeAction,
  ) => void;
  setOperationErrorNameOperation: (
    state: DocumentModelGlobalState,
    action: SetOperationErrorNameAction,
  ) => void;
  setOperationErrorDescriptionOperation: (
    state: DocumentModelGlobalState,
    action: SetOperationErrorDescriptionAction,
  ) => void;
  setOperationErrorTemplateOperation: (
    state: DocumentModelGlobalState,
    action: SetOperationErrorTemplateAction,
  ) => void;
  deleteOperationErrorOperation: (
    state: DocumentModelGlobalState,
    action: DeleteOperationErrorAction,
  ) => void;
  reorderOperationErrorsOperation: (
    state: DocumentModelGlobalState,
    action: ReorderOperationErrorsAction,
  ) => void;
}
