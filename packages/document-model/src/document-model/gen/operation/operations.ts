import {
  type AddOperationAction,
  type SetOperationNameAction,
  type SetOperationSchemaAction,
  type SetOperationDescriptionAction,
  type SetOperationTemplateAction,
  type SetOperationReducerAction,
  type MoveOperationAction,
  type DeleteOperationAction,
  type ReorderModuleOperationsAction,
  type SetOperationScopeAction,
} from "./actions.js";
import { type DocumentModelState } from "../types.js";

export interface DocumentModelOperationOperations {
  addOperationOperation: (
    state: DocumentModelState,
    action: AddOperationAction,
  ) => void;
  setOperationNameOperation: (
    state: DocumentModelState,
    action: SetOperationNameAction,
  ) => void;
  setOperationScopeOperation: (
    state: DocumentModelState,
    action: SetOperationScopeAction,
  ) => void;
  setOperationSchemaOperation: (
    state: DocumentModelState,
    action: SetOperationSchemaAction,
  ) => void;
  setOperationDescriptionOperation: (
    state: DocumentModelState,
    action: SetOperationDescriptionAction,
  ) => void;
  setOperationTemplateOperation: (
    state: DocumentModelState,
    action: SetOperationTemplateAction,
  ) => void;
  setOperationReducerOperation: (
    state: DocumentModelState,
    action: SetOperationReducerAction,
  ) => void;
  moveOperationOperation: (
    state: DocumentModelState,
    action: MoveOperationAction,
  ) => void;
  deleteOperationOperation: (
    state: DocumentModelState,
    action: DeleteOperationAction,
  ) => void;
  reorderModuleOperationsOperation: (
    state: DocumentModelState,
    action: ReorderModuleOperationsAction,
  ) => void;
}
