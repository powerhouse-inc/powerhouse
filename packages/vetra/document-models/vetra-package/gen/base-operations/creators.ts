import { createAction } from "document-model";
import {
  z,
  type SetPackageNameInput,
  type SetPackageDescriptionInput,
  type SetPackageCategoryInput,
  type SetPackageAuthorInput,
  type SetPackageAuthorNameInput,
  type SetPackageAuthorWebsiteInput,
  type AddPackageKeywordInput,
  type RemovePackageKeywordInput,
  type SetPackageGithubUrlInput,
  type SetPackageNpmUrlInput,
} from "../types.js";
import {
  type SetPackageNameAction,
  type SetPackageDescriptionAction,
  type SetPackageCategoryAction,
  type SetPackageAuthorAction,
  type SetPackageAuthorNameAction,
  type SetPackageAuthorWebsiteAction,
  type AddPackageKeywordAction,
  type RemovePackageKeywordAction,
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

export const setPackageAuthor = (input: SetPackageAuthorInput) =>
  createAction<SetPackageAuthorAction>(
    "SET_PACKAGE_AUTHOR",
    { ...input },
    undefined,
    z.SetPackageAuthorInputSchema,
    "global",
  );

export const setPackageAuthorName = (input: SetPackageAuthorNameInput) =>
  createAction<SetPackageAuthorNameAction>(
    "SET_PACKAGE_AUTHOR_NAME",
    { ...input },
    undefined,
    z.SetPackageAuthorNameInputSchema,
    "global",
  );

export const setPackageAuthorWebsite = (input: SetPackageAuthorWebsiteInput) =>
  createAction<SetPackageAuthorWebsiteAction>(
    "SET_PACKAGE_AUTHOR_WEBSITE",
    { ...input },
    undefined,
    z.SetPackageAuthorWebsiteInputSchema,
    "global",
  );

export const addPackageKeyword = (input: AddPackageKeywordInput) =>
  createAction<AddPackageKeywordAction>(
    "ADD_PACKAGE_KEYWORD",
    { ...input },
    undefined,
    z.AddPackageKeywordInputSchema,
    "global",
  );

export const removePackageKeyword = (input: RemovePackageKeywordInput) =>
  createAction<RemovePackageKeywordAction>(
    "REMOVE_PACKAGE_KEYWORD",
    { ...input },
    undefined,
    z.RemovePackageKeywordInputSchema,
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
