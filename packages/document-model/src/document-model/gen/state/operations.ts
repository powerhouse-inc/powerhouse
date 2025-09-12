import type {
  AddStateExampleAction,
  DeleteStateExampleAction,
  DocumentModelGlobalState,
  ReorderStateExamplesAction,
  SetInitialStateAction,
  SetStateSchemaAction,
  UpdateStateExampleAction,
} from "document-model";

export interface DocumentModelStateOperations {
  setStateSchemaOperation: (
    state: DocumentModelGlobalState,
    action: SetStateSchemaAction,
  ) => void;
  setInitialStateOperation: (
    state: DocumentModelGlobalState,
    action: SetInitialStateAction,
  ) => void;
  addStateExampleOperation: (
    state: DocumentModelGlobalState,
    action: AddStateExampleAction,
  ) => void;
  updateStateExampleOperation: (
    state: DocumentModelGlobalState,
    action: UpdateStateExampleAction,
  ) => void;
  deleteStateExampleOperation: (
    state: DocumentModelGlobalState,
    action: DeleteStateExampleAction,
  ) => void;
  reorderStateExamplesOperation: (
    state: DocumentModelGlobalState,
    action: ReorderStateExamplesAction,
  ) => void;
}
