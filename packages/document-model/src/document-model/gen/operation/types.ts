import type {
  AddOperationAction,
  DeleteOperationAction,
  DocumentModelGlobalState,
  MoveOperationAction,
  ReorderModuleOperationsAction,
  SetOperationDescriptionAction,
  SetOperationNameAction,
  SetOperationReducerAction,
  SetOperationSchemaAction,
  SetOperationScopeAction,
  SetOperationTemplateAction,
} from "document-model";
export type * from "./actions.js";

export type DocumentModelOperationOperations = {
  addOperationOperation: (
    state: DocumentModelGlobalState,
    action: AddOperationAction,
  ) => void;
  setOperationNameOperation: (
    state: DocumentModelGlobalState,
    action: SetOperationNameAction,
  ) => void;
  setOperationScopeOperation: (
    state: DocumentModelGlobalState,
    action: SetOperationScopeAction,
  ) => void;
  setOperationSchemaOperation: (
    state: DocumentModelGlobalState,
    action: SetOperationSchemaAction,
  ) => void;
  setOperationDescriptionOperation: (
    state: DocumentModelGlobalState,
    action: SetOperationDescriptionAction,
  ) => void;
  setOperationTemplateOperation: (
    state: DocumentModelGlobalState,
    action: SetOperationTemplateAction,
  ) => void;
  setOperationReducerOperation: (
    state: DocumentModelGlobalState,
    action: SetOperationReducerAction,
  ) => void;
  moveOperationOperation: (
    state: DocumentModelGlobalState,
    action: MoveOperationAction,
  ) => void;
  deleteOperationOperation: (
    state: DocumentModelGlobalState,
    action: DeleteOperationAction,
  ) => void;
  reorderModuleOperationsOperation: (
    state: DocumentModelGlobalState,
    action: ReorderModuleOperationsAction,
  ) => void;
};
