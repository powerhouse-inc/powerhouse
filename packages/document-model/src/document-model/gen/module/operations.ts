import type {
  AddModuleAction,
  SetModuleNameAction,
  SetModuleDescriptionAction,
  DeleteModuleAction,
  ReorderModulesAction,
} from "./actions.js";
import type { DocumentModelState } from "../types.js";

export interface DocumentModelModuleOperations {
  addModuleOperation: (
    state: DocumentModelState,
    action: AddModuleAction,
  ) => void;
  setModuleNameOperation: (
    state: DocumentModelState,
    action: SetModuleNameAction,
  ) => void;
  setModuleDescriptionOperation: (
    state: DocumentModelState,
    action: SetModuleDescriptionAction,
  ) => void;
  deleteModuleOperation: (
    state: DocumentModelState,
    action: DeleteModuleAction,
  ) => void;
  reorderModulesOperation: (
    state: DocumentModelState,
    action: ReorderModulesAction,
  ) => void;
}
