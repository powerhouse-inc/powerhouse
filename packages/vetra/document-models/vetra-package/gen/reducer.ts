// TODO: remove eslint-disable rules once refactor is done
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { StateReducer } from "document-model";
import { isDocumentAction, createReducer } from "document-model/core";
import type { VetraPackagePHState } from "@powerhousedao/vetra/document-models/vetra-package";

import { vetraPackageBaseOperationsOperations } from "../src/reducers/base-operations.js";

import {
  SetPackageNameInputSchema,
  SetPackageDescriptionInputSchema,
  SetPackageCategoryInputSchema,
  SetPackageAuthorInputSchema,
  SetPackageAuthorNameInputSchema,
  SetPackageAuthorWebsiteInputSchema,
  AddPackageKeywordInputSchema,
  RemovePackageKeywordInputSchema,
  SetPackageGithubUrlInputSchema,
  SetPackageNpmUrlInputSchema,
} from "./schema/zod.js";

const stateReducer: StateReducer<VetraPackagePHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "SET_PACKAGE_NAME": {
      SetPackageNameInputSchema().parse(action.input);

      vetraPackageBaseOperationsOperations.setPackageNameOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_PACKAGE_DESCRIPTION": {
      SetPackageDescriptionInputSchema().parse(action.input);

      vetraPackageBaseOperationsOperations.setPackageDescriptionOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_PACKAGE_CATEGORY": {
      SetPackageCategoryInputSchema().parse(action.input);

      vetraPackageBaseOperationsOperations.setPackageCategoryOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_PACKAGE_AUTHOR": {
      SetPackageAuthorInputSchema().parse(action.input);

      vetraPackageBaseOperationsOperations.setPackageAuthorOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_PACKAGE_AUTHOR_NAME": {
      SetPackageAuthorNameInputSchema().parse(action.input);

      vetraPackageBaseOperationsOperations.setPackageAuthorNameOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_PACKAGE_AUTHOR_WEBSITE": {
      SetPackageAuthorWebsiteInputSchema().parse(action.input);

      vetraPackageBaseOperationsOperations.setPackageAuthorWebsiteOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_PACKAGE_KEYWORD": {
      AddPackageKeywordInputSchema().parse(action.input);

      vetraPackageBaseOperationsOperations.addPackageKeywordOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_PACKAGE_KEYWORD": {
      RemovePackageKeywordInputSchema().parse(action.input);

      vetraPackageBaseOperationsOperations.removePackageKeywordOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_PACKAGE_GITHUB_URL": {
      SetPackageGithubUrlInputSchema().parse(action.input);

      vetraPackageBaseOperationsOperations.setPackageGithubUrlOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_PACKAGE_NPM_URL": {
      SetPackageNpmUrlInputSchema().parse(action.input);

      vetraPackageBaseOperationsOperations.setPackageNpmUrlOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    default:
      return state;
  }
};

export const reducer = createReducer<VetraPackagePHState>(stateReducer);
