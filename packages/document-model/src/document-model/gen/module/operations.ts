import type { DocumentModelState } from "document-model";
import type {
  AddModuleAction,
  DeleteModuleAction,
  ReorderModulesAction,
  SetModuleDescriptionAction,
  SetModuleNameAction,
} from "document-model";

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
