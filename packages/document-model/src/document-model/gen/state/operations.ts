import type {
  SetStateSchemaAction,
  SetInitialStateAction,
  AddStateExampleAction,
  UpdateStateExampleAction,
  DeleteStateExampleAction,
  ReorderStateExamplesAction,
} from "./actions.js";
import type { DocumentModelState } from "../types.js";

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
