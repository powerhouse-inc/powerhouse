import { type BaseAction } from "document-model";
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

export type SetPackageNameAction = BaseAction<SetPackageNameInput> & {
  type: "SET_PACKAGE_NAME";
};
export type SetPackageDescriptionAction = BaseAction<SetPackageDescriptionInput> & {
  type: "SET_PACKAGE_DESCRIPTION";
};
export type SetPackageCategoryAction = BaseAction<SetPackageCategoryInput> & {
  type: "SET_PACKAGE_CATEGORY";
};
export type SetPackagePublisherAction = BaseAction<SetPackagePublisherInput> & {
  type: "SET_PACKAGE_PUBLISHER";
};
export type SetPackagePublisherUrlAction = BaseAction<SetPackagePublisherUrlInput> & {
  type: "SET_PACKAGE_PUBLISHER_URL";
};
export type SetPackageKeywordsAction = BaseAction<SetPackageKeywordsInput> & {
  type: "SET_PACKAGE_KEYWORDS";
};
export type SetPackageGithubUrlAction = BaseAction<SetPackageGithubUrlInput> & {
  type: "SET_PACKAGE_GITHUB_URL";
};
export type SetPackageNpmUrlAction = BaseAction<SetPackageNpmUrlInput> & {
  type: "SET_PACKAGE_NPM_URL";
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
