import {
  type StateReducer,
  isDocumentAction,
  createReducer,
} from "document-model";
import { type VetraPackageDocument, z } from "./types.js";

import { reducer as BaseOperationsReducer } from "../src/reducers/base-operations.js";

const stateReducer: StateReducer<VetraPackageDocument> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }

  switch (action.type) {
    case "SET_PACKAGE_NAME":
      z.SetPackageNameInputSchema().parse(action.input);
      BaseOperationsReducer.setPackageNameOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_PACKAGE_DESCRIPTION":
      z.SetPackageDescriptionInputSchema().parse(action.input);
      BaseOperationsReducer.setPackageDescriptionOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_PACKAGE_CATEGORY":
      z.SetPackageCategoryInputSchema().parse(action.input);
      BaseOperationsReducer.setPackageCategoryOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_PACKAGE_AUTHOR":
      z.SetPackageAuthorInputSchema().parse(action.input);
      BaseOperationsReducer.setPackageAuthorOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_PACKAGE_AUTHOR_NAME":
      z.SetPackageAuthorNameInputSchema().parse(action.input);
      BaseOperationsReducer.setPackageAuthorNameOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_PACKAGE_AUTHOR_WEBSITE":
      z.SetPackageAuthorWebsiteInputSchema().parse(action.input);
      BaseOperationsReducer.setPackageAuthorWebsiteOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;

    case "ADD_PACKAGE_KEYWORD":
      z.AddPackageKeywordInputSchema().parse(action.input);
      BaseOperationsReducer.addPackageKeywordOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;

    case "REMOVE_PACKAGE_KEYWORD":
      z.RemovePackageKeywordInputSchema().parse(action.input);
      BaseOperationsReducer.removePackageKeywordOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_PACKAGE_GITHUB_URL":
      z.SetPackageGithubUrlInputSchema().parse(action.input);
      BaseOperationsReducer.setPackageGithubUrlOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_PACKAGE_NPM_URL":
      z.SetPackageNpmUrlInputSchema().parse(action.input);
      BaseOperationsReducer.setPackageNpmUrlOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;

    default:
      return state;
  }
};

export const reducer = createReducer<VetraPackageDocument>(stateReducer);
