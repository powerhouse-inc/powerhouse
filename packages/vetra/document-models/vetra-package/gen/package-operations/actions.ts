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

export type SetPackageNameAction = BaseAction<
  "SET_PACKAGE_NAME",
  SetPackageNameInput
>;
export type SetPackageDescriptionAction = BaseAction<
  "SET_PACKAGE_DESCRIPTION",
  SetPackageDescriptionInput
>;
export type SetPackageCategoryAction = BaseAction<
  "SET_PACKAGE_CATEGORY",
  SetPackageCategoryInput
>;
export type SetPackagePublisherAction = BaseAction<
  "SET_PACKAGE_PUBLISHER",
  SetPackagePublisherInput
>;
export type SetPackagePublisherUrlAction = BaseAction<
  "SET_PACKAGE_PUBLISHER_URL",
  SetPackagePublisherUrlInput
>;
export type SetPackageKeywordsAction = BaseAction<
  "SET_PACKAGE_KEYWORDS",
  SetPackageKeywordsInput
>;
export type SetPackageGithubUrlAction = BaseAction<
  "SET_PACKAGE_GITHUB_URL",
  SetPackageGithubUrlInput
>;
export type SetPackageNpmUrlAction = BaseAction<
  "SET_PACKAGE_NPM_URL",
  SetPackageNpmUrlInput
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
