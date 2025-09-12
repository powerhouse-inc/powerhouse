import type {
  Action,
  SetAuthorNameInput,
  SetAuthorWebsiteInput,
  SetModelDescriptionInput,
  SetModelExtensionInput,
  SetModelIdInput,
  SetModelNameInput,
} from "document-model";

export type SetModelNameAction = Action & {
  type: "SET_MODEL_NAME";
  input: SetModelNameInput;
};
export type SetModelIdAction = Action & {
  type: "SET_MODEL_ID";
  input: SetModelIdInput;
};
export type SetModelExtensionAction = Action & {
  type: "SET_MODEL_EXTENSION";
  input: SetModelExtensionInput;
};
export type SetModelDescriptionAction = Action & {
  type: "SET_MODEL_DESCRIPTION";
  input: SetModelDescriptionInput;
};
export type SetAuthorNameAction = Action & {
  type: "SET_AUTHOR_NAME";
  input: SetAuthorNameInput;
};
export type SetAuthorWebsiteAction = Action & {
  type: "SET_AUTHOR_WEBSITE";
  input: SetAuthorWebsiteInput;
};

export type DocumentModelHeaderAction =
  | SetModelNameAction
  | SetModelIdAction
  | SetModelExtensionAction
  | SetModelDescriptionAction
  | SetAuthorNameAction
  | SetAuthorWebsiteAction;
