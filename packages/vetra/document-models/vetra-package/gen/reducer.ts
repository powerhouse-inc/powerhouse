import {
  type StateReducer,
  isDocumentAction,
  createReducer,
} from "document-model";
import { type VetraPackageDocument, z } from "./types.js";

import { reducer as PackageOperationsReducer } from "../src/reducers/package-operations.js";

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
      PackageOperationsReducer.setPackageNameOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "SET_PACKAGE_DESCRIPTION":
      z.SetPackageDescriptionInputSchema().parse(action.input);
      PackageOperationsReducer.setPackageDescriptionOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "SET_PACKAGE_CATEGORY":
      z.SetPackageCategoryInputSchema().parse(action.input);
      PackageOperationsReducer.setPackageCategoryOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "SET_PACKAGE_PUBLISHER":
      z.SetPackagePublisherInputSchema().parse(action.input);
      PackageOperationsReducer.setPackagePublisherOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "SET_PACKAGE_PUBLISHER_URL":
      z.SetPackagePublisherUrlInputSchema().parse(action.input);
      PackageOperationsReducer.setPackagePublisherUrlOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "SET_PACKAGE_KEYWORDS":
      z.SetPackageKeywordsInputSchema().parse(action.input);
      PackageOperationsReducer.setPackageKeywordsOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "SET_PACKAGE_GITHUB_URL":
      z.SetPackageGithubUrlInputSchema().parse(action.input);
      PackageOperationsReducer.setPackageGithubUrlOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "SET_PACKAGE_NPM_URL":
      z.SetPackageNpmUrlInputSchema().parse(action.input);
      PackageOperationsReducer.setPackageNpmUrlOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    default:
      return state;
  }
};

export const reducer = createReducer<VetraPackageDocument>(stateReducer);
