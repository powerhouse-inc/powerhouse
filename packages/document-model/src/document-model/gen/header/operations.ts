import { type DocumentModelState } from "../types.js";
import {
  type SetAuthorNameAction,
  type SetAuthorWebsiteAction,
  type SetModelDescriptionAction,
  type SetModelExtensionAction,
  type SetModelIdAction,
  type SetModelNameAction,
} from "./actions.js";

export interface DocumentModelHeaderOperations {
  setModelNameOperation: (
    state: DocumentModelState,
    action: SetModelNameAction,
  ) => void;
  setModelIdOperation: (
    state: DocumentModelState,
    action: SetModelIdAction,
  ) => void;
  setModelExtensionOperation: (
    state: DocumentModelState,
    action: SetModelExtensionAction,
  ) => void;
  setModelDescriptionOperation: (
    state: DocumentModelState,
    action: SetModelDescriptionAction,
  ) => void;
  setAuthorNameOperation: (
    state: DocumentModelState,
    action: SetAuthorNameAction,
  ) => void;
  setAuthorWebsiteOperation: (
    state: DocumentModelState,
    action: SetAuthorWebsiteAction,
  ) => void;
}
