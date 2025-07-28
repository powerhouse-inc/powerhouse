import { createAction } from "document-model";
import {
  z,
  type SetPackageNameInput,
  type SetPackageDescriptionInput,
  type SetPackageCategoryInput,
  type SetPackagePublisherInput,
  type SetPackagePublisherUrlInput,
  type SetPackageKeywordsInput,
  type SetPackageGithubUrlInput,
  type SetPackageNpmUrlInput,
} from "../types.js";
import {
  type SetPackageNameAction,
  type SetPackageDescriptionAction,
  type SetPackageCategoryAction,
  type SetPackagePublisherAction,
  type SetPackagePublisherUrlAction,
  type SetPackageKeywordsAction,
  type SetPackageGithubUrlAction,
  type SetPackageNpmUrlAction,
} from "./actions.js";

export const setPackageName = (input: SetPackageNameInput) =>
  createAction<SetPackageNameAction>(
    "SET_PACKAGE_NAME",
    { ...input },
    undefined,
    z.SetPackageNameInputSchema,
    "global",
  );

export const setPackageDescription = (input: SetPackageDescriptionInput) =>
  createAction<SetPackageDescriptionAction>(
    "SET_PACKAGE_DESCRIPTION",
    { ...input },
    undefined,
    z.SetPackageDescriptionInputSchema,
    "global",
  );

export const setPackageCategory = (input: SetPackageCategoryInput) =>
  createAction<SetPackageCategoryAction>(
    "SET_PACKAGE_CATEGORY",
    { ...input },
    undefined,
    z.SetPackageCategoryInputSchema,
    "global",
  );

export const setPackagePublisher = (input: SetPackagePublisherInput) =>
  createAction<SetPackagePublisherAction>(
    "SET_PACKAGE_PUBLISHER",
    { ...input },
    undefined,
    z.SetPackagePublisherInputSchema,
    "global",
  );

export const setPackagePublisherUrl = (input: SetPackagePublisherUrlInput) =>
  createAction<SetPackagePublisherUrlAction>(
    "SET_PACKAGE_PUBLISHER_URL",
    { ...input },
    undefined,
    z.SetPackagePublisherUrlInputSchema,
    "global",
  );

export const setPackageKeywords = (input: SetPackageKeywordsInput) =>
  createAction<SetPackageKeywordsAction>(
    "SET_PACKAGE_KEYWORDS",
    { ...input },
    undefined,
    z.SetPackageKeywordsInputSchema,
    "global",
  );

export const setPackageGithubUrl = (input: SetPackageGithubUrlInput) =>
  createAction<SetPackageGithubUrlAction>(
    "SET_PACKAGE_GITHUB_URL",
    { ...input },
    undefined,
    z.SetPackageGithubUrlInputSchema,
    "global",
  );

export const setPackageNpmUrl = (input: SetPackageNpmUrlInput) =>
  createAction<SetPackageNpmUrlAction>(
    "SET_PACKAGE_NPM_URL",
    { ...input },
    undefined,
    z.SetPackageNpmUrlInputSchema,
    "global",
  );
