import { type Action } from "document-model";
import type {
  SetPackageNameInput,
  SetPackageDescriptionInput,
  SetPackageCategoryInput,
  SetPackageAuthorInput,
  SetPackageAuthorNameInput,
  SetPackageAuthorWebsiteInput,
  AddPackageKeywordInput,
  RemovePackageKeywordInput,
  SetPackageGithubUrlInput,
  SetPackageNpmUrlInput,
} from "../types.js";

export type SetPackageNameAction = Action & {
  type: "SET_PACKAGE_NAME";
  input: SetPackageNameInput;
};
export type SetPackageDescriptionAction = Action & {
  type: "SET_PACKAGE_DESCRIPTION";
  input: SetPackageDescriptionInput;
};
export type SetPackageCategoryAction = Action & {
  type: "SET_PACKAGE_CATEGORY";
  input: SetPackageCategoryInput;
};
export type SetPackageAuthorAction = Action & {
  type: "SET_PACKAGE_AUTHOR";
  input: SetPackageAuthorInput;
};
export type SetPackageAuthorNameAction = Action & {
  type: "SET_PACKAGE_AUTHOR_NAME";
  input: SetPackageAuthorNameInput;
};
export type SetPackageAuthorWebsiteAction = Action & {
  type: "SET_PACKAGE_AUTHOR_WEBSITE";
  input: SetPackageAuthorWebsiteInput;
};
export type AddPackageKeywordAction = Action & {
  type: "ADD_PACKAGE_KEYWORD";
  input: AddPackageKeywordInput;
};
export type RemovePackageKeywordAction = Action & {
  type: "REMOVE_PACKAGE_KEYWORD";
  input: RemovePackageKeywordInput;
};
export type SetPackageGithubUrlAction = Action & {
  type: "SET_PACKAGE_GITHUB_URL";
  input: SetPackageGithubUrlInput;
};
export type SetPackageNpmUrlAction = Action & {
  type: "SET_PACKAGE_NPM_URL";
  input: SetPackageNpmUrlInput;
};

export type VetraPackageBaseOperationsAction =
  | SetPackageNameAction
  | SetPackageDescriptionAction
  | SetPackageCategoryAction
  | SetPackageAuthorAction
  | SetPackageAuthorNameAction
  | SetPackageAuthorWebsiteAction
  | AddPackageKeywordAction
  | RemovePackageKeywordAction
  | SetPackageGithubUrlAction
  | SetPackageNpmUrlAction;
