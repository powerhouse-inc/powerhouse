import { BaseAction } from "@document/types.js";
import { SetModelNameInput, SetModelIdInput, SetModelExtensionInput, SetModelDescriptionInput, SetAuthorNameInput, SetAuthorWebsiteInput } from "../schema/types.js";

export type SetModelNameAction = BaseAction<"SET_MODEL_NAME", SetModelNameInput>;
export type SetModelIdAction = BaseAction<"SET_MODEL_ID", SetModelIdInput>;
export type SetModelExtensionAction = BaseAction<
  "SET_MODEL_EXTENSION",
  SetModelExtensionInput
>;
export type SetModelDescriptionAction = BaseAction<
  "SET_MODEL_DESCRIPTION",
  SetModelDescriptionInput
>;
export type SetAuthorNameAction = BaseAction<"SET_AUTHOR_NAME", SetAuthorNameInput>;
export type SetAuthorWebsiteAction = BaseAction<
  "SET_AUTHOR_WEBSITE",
  SetAuthorWebsiteInput
>;

export type DocumentModelHeaderAction =
  | SetModelNameAction
  | SetModelIdAction
  | SetModelExtensionAction
  | SetModelDescriptionAction
  | SetAuthorNameAction
  | SetAuthorWebsiteAction;
