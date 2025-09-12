import type {
  DocumentModelGlobalState,
  SetAuthorNameAction,
  SetAuthorWebsiteAction,
  SetModelDescriptionAction,
  SetModelExtensionAction,
  SetModelIdAction,
  SetModelNameAction,
} from "document-model";

export interface DocumentModelHeaderOperations {
  setModelNameOperation: (
    state: DocumentModelGlobalState,
    action: SetModelNameAction,
  ) => void;
  setModelIdOperation: (
    state: DocumentModelGlobalState,
    action: SetModelIdAction,
  ) => void;
  setModelExtensionOperation: (
    state: DocumentModelGlobalState,
    action: SetModelExtensionAction,
  ) => void;
  setModelDescriptionOperation: (
    state: DocumentModelGlobalState,
    action: SetModelDescriptionAction,
  ) => void;
  setAuthorNameOperation: (
    state: DocumentModelGlobalState,
    action: SetAuthorNameAction,
  ) => void;
  setAuthorWebsiteOperation: (
    state: DocumentModelGlobalState,
    action: SetAuthorWebsiteAction,
  ) => void;
}
