import { createAction } from "document-model";
import {
  AddPackageKeywordInputSchema,
  RemovePackageKeywordInputSchema,
  SetPackageAuthorInputSchema,
  SetPackageAuthorNameInputSchema,
  SetPackageAuthorWebsiteInputSchema,
  SetPackageCategoryInputSchema,
  SetPackageDescriptionInputSchema,
  SetPackageGithubUrlInputSchema,
  SetPackageNameInputSchema,
  SetPackageNpmUrlInputSchema,
} from "../schema/zod.js";
import type {
  AddPackageKeywordInput,
  RemovePackageKeywordInput,
  SetPackageAuthorInput,
  SetPackageAuthorNameInput,
  SetPackageAuthorWebsiteInput,
  SetPackageCategoryInput,
  SetPackageDescriptionInput,
  SetPackageGithubUrlInput,
  SetPackageNameInput,
  SetPackageNpmUrlInput,
} from "../types.js";
import type {
  AddPackageKeywordAction,
  RemovePackageKeywordAction,
  SetPackageAuthorAction,
  SetPackageAuthorNameAction,
  SetPackageAuthorWebsiteAction,
  SetPackageCategoryAction,
  SetPackageDescriptionAction,
  SetPackageGithubUrlAction,
  SetPackageNameAction,
  SetPackageNpmUrlAction,
} from "./actions.js";

export const setPackageName = (input: SetPackageNameInput) =>
  createAction<SetPackageNameAction>(
    "SET_PACKAGE_NAME",
    { ...input },
    undefined,
    SetPackageNameInputSchema,
    "global",
  );

export const setPackageDescription = (input: SetPackageDescriptionInput) =>
  createAction<SetPackageDescriptionAction>(
    "SET_PACKAGE_DESCRIPTION",
    { ...input },
    undefined,
    SetPackageDescriptionInputSchema,
    "global",
  );

export const setPackageCategory = (input: SetPackageCategoryInput) =>
  createAction<SetPackageCategoryAction>(
    "SET_PACKAGE_CATEGORY",
    { ...input },
    undefined,
    SetPackageCategoryInputSchema,
    "global",
  );

export const setPackageAuthor = (input: SetPackageAuthorInput) =>
  createAction<SetPackageAuthorAction>(
    "SET_PACKAGE_AUTHOR",
    { ...input },
    undefined,
    SetPackageAuthorInputSchema,
    "global",
  );

export const setPackageAuthorName = (input: SetPackageAuthorNameInput) =>
  createAction<SetPackageAuthorNameAction>(
    "SET_PACKAGE_AUTHOR_NAME",
    { ...input },
    undefined,
    SetPackageAuthorNameInputSchema,
    "global",
  );

export const setPackageAuthorWebsite = (input: SetPackageAuthorWebsiteInput) =>
  createAction<SetPackageAuthorWebsiteAction>(
    "SET_PACKAGE_AUTHOR_WEBSITE",
    { ...input },
    undefined,
    SetPackageAuthorWebsiteInputSchema,
    "global",
  );

export const addPackageKeyword = (input: AddPackageKeywordInput) =>
  createAction<AddPackageKeywordAction>(
    "ADD_PACKAGE_KEYWORD",
    { ...input },
    undefined,
    AddPackageKeywordInputSchema,
    "global",
  );

export const removePackageKeyword = (input: RemovePackageKeywordInput) =>
  createAction<RemovePackageKeywordAction>(
    "REMOVE_PACKAGE_KEYWORD",
    { ...input },
    undefined,
    RemovePackageKeywordInputSchema,
    "global",
  );

export const setPackageGithubUrl = (input: SetPackageGithubUrlInput) =>
  createAction<SetPackageGithubUrlAction>(
    "SET_PACKAGE_GITHUB_URL",
    { ...input },
    undefined,
    SetPackageGithubUrlInputSchema,
    "global",
  );

export const setPackageNpmUrl = (input: SetPackageNpmUrlInput) =>
  createAction<SetPackageNpmUrlAction>(
    "SET_PACKAGE_NPM_URL",
    { ...input },
    undefined,
    SetPackageNpmUrlInputSchema,
    "global",
  );
