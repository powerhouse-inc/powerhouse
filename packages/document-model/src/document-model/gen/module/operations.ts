import type { DocumentModelGlobalState } from "document-model";
import type {
  AddModuleAction,
  DeleteModuleAction,
  ReorderModulesAction,
  SetModuleDescriptionAction,
  SetModuleNameAction,
} from "document-model";

export interface DocumentModelModuleOperations {
  addModuleOperation: (
    state: DocumentModelGlobalState,
    action: AddModuleAction,
  ) => void;
  setModuleNameOperation: (
    state: DocumentModelGlobalState,
    action: SetModuleNameAction,
  ) => void;
  setModuleDescriptionOperation: (
    state: DocumentModelGlobalState,
    action: SetModuleDescriptionAction,
  ) => void;
  deleteModuleOperation: (
    state: DocumentModelGlobalState,
    action: DeleteModuleAction,
  ) => void;
  reorderModulesOperation: (
    state: DocumentModelGlobalState,
    action: ReorderModulesAction,
  ) => void;
}
