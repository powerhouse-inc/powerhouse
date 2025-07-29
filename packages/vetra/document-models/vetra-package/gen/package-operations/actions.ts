import { type BaseAction } from "document-model";
import type {
  SetPackageNameInput,
  SetPackageDescriptionInput,
  SetPackageCategoryInput,
  SetPackagePublisherInput,
  SetPackagePublisherUrlInput,
  SetPackageKeywordsInput,
  SetPackageGithubUrlInput,
  SetPackageNpmUrlInput,
} from "../types.js";

export type SetPackageNameAction = BaseAction<
  "SET_PACKAGE_NAME",
  SetPackageNameInput,
  "global"
>;
export type SetPackageDescriptionAction = BaseAction<
  "SET_PACKAGE_DESCRIPTION",
  SetPackageDescriptionInput,
  "global"
>;
export type SetPackageCategoryAction = BaseAction<
  "SET_PACKAGE_CATEGORY",
  SetPackageCategoryInput,
  "global"
>;
export type SetPackagePublisherAction = BaseAction<
  "SET_PACKAGE_PUBLISHER",
  SetPackagePublisherInput,
  "global"
>;
export type SetPackagePublisherUrlAction = BaseAction<
  "SET_PACKAGE_PUBLISHER_URL",
  SetPackagePublisherUrlInput,
  "global"
>;
export type SetPackageKeywordsAction = BaseAction<
  "SET_PACKAGE_KEYWORDS",
  SetPackageKeywordsInput,
  "global"
>;
export type SetPackageGithubUrlAction = BaseAction<
  "SET_PACKAGE_GITHUB_URL",
  SetPackageGithubUrlInput,
  "global"
>;
export type SetPackageNpmUrlAction = BaseAction<
  "SET_PACKAGE_NPM_URL",
  SetPackageNpmUrlInput,
  "global"
>;

export type VetraPackagePackageOperationsAction =
  | SetPackageNameAction
  | SetPackageDescriptionAction
  | SetPackageCategoryAction
  | SetPackagePublisherAction
  | SetPackagePublisherUrlAction
  | SetPackageKeywordsAction
  | SetPackageGithubUrlAction
  | SetPackageNpmUrlAction;
