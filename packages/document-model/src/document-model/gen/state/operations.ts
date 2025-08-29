import type {
  AddStateExampleAction,
  DeleteStateExampleAction,
  DocumentModelState,
  ReorderStateExamplesAction,
  SetInitialStateAction,
  SetStateSchemaAction,
  UpdateStateExampleAction,
} from "document-model";

export interface DocumentModelStateOperations {
  setStateSchemaOperation: (
    state: DocumentModelState,
    action: SetStateSchemaAction,
  ) => void;
  setInitialStateOperation: (
    state: DocumentModelState,
    action: SetInitialStateAction,
  ) => void;
  addStateExampleOperation: (
    state: DocumentModelState,
    action: AddStateExampleAction,
  ) => void;
  updateStateExampleOperation: (
    state: DocumentModelState,
    action: UpdateStateExampleAction,
  ) => void;
  deleteStateExampleOperation: (
    state: DocumentModelState,
    action: DeleteStateExampleAction,
  ) => void;
  reorderStateExamplesOperation: (
    state: DocumentModelState,
    action: ReorderStateExamplesAction,
  ) => void;
}
