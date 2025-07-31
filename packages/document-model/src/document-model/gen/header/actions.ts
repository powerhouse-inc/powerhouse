import { BaseAction } from "../../../document/types.js";
import {
  SetAuthorNameInput,
  SetAuthorWebsiteInput,
  SetModelDescriptionInput,
  SetModelExtensionInput,
  SetModelIdInput,
  SetModelNameInput,
} from "../schema/types.js";

export type SetModelNameAction = BaseAction<SetModelNameInput> & {
  type: "SET_MODEL_NAME";
};
export type SetModelIdAction = BaseAction<SetModelIdInput> & {
  type: "SET_MODEL_ID";
};
export type SetModelExtensionAction = BaseAction<SetModelExtensionInput> & {
  type: "SET_MODEL_EXTENSION";
};
export type SetModelDescriptionAction = BaseAction<SetModelDescriptionInput> & {
  type: "SET_MODEL_DESCRIPTION";
};
export type SetAuthorNameAction = BaseAction<SetAuthorNameInput> & {
  type: "SET_AUTHOR_NAME";
};
export type SetAuthorWebsiteAction = BaseAction<SetAuthorWebsiteInput> & {
  type: "SET_AUTHOR_WEBSITE";
};

export type DocumentModelHeaderAction =
  | SetModelNameAction
  | SetModelIdAction
  | SetModelExtensionAction
  | SetModelDescriptionAction
  | SetAuthorNameAction
  | SetAuthorWebsiteAction;
