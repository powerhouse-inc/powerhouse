import { type Action } from "document-model";
import type {
  SetPackageCategoryInput,
  SetPackageDescriptionInput,
  SetPackageGithubUrlInput,
  SetPackageKeywordsInput,
  SetPackageNameInput,
  SetPackageNpmUrlInput,
  SetPackagePublisherInput,
  SetPackagePublisherUrlInput,
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
export type SetPackagePublisherAction = Action & {
  type: "SET_PACKAGE_PUBLISHER";
  input: SetPackagePublisherInput;
};
export type SetPackagePublisherUrlAction = Action & {
  type: "SET_PACKAGE_PUBLISHER_URL";
  input: SetPackagePublisherUrlInput;
};
export type SetPackageKeywordsAction = Action & {
  type: "SET_PACKAGE_KEYWORDS";
  input: SetPackageKeywordsInput;
};
export type SetPackageGithubUrlAction = Action & {
  type: "SET_PACKAGE_GITHUB_URL";
  input: SetPackageGithubUrlInput;
};
export type SetPackageNpmUrlAction = Action & {
  type: "SET_PACKAGE_NPM_URL";
  input: SetPackageNpmUrlInput;
};

export type VetraPackagePackageOperationsAction =
  | SetPackageNameAction
  | SetPackageDescriptionAction
  | SetPackageCategoryAction
  | SetPackagePublisherAction
  | SetPackagePublisherUrlAction
  | SetPackageKeywordsAction
  | SetPackageGithubUrlAction
  | SetPackageNpmUrlAction;
