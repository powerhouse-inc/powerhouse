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

  // Skip Operations (they have an index property)
  if ("index" in action) {
    return state;
  }

  const typedAction = action as any;
  switch (typedAction.type) {
    case "SET_PACKAGE_NAME":
      z.SetPackageNameInputSchema().parse(typedAction.input);
      PackageOperationsReducer.setPackageNameOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_PACKAGE_DESCRIPTION":
      z.SetPackageDescriptionInputSchema().parse(typedAction.input);
      PackageOperationsReducer.setPackageDescriptionOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_PACKAGE_CATEGORY":
      z.SetPackageCategoryInputSchema().parse(typedAction.input);
      PackageOperationsReducer.setPackageCategoryOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_PACKAGE_PUBLISHER":
      z.SetPackagePublisherInputSchema().parse(typedAction.input);
      PackageOperationsReducer.setPackagePublisherOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_PACKAGE_PUBLISHER_URL":
      z.SetPackagePublisherUrlInputSchema().parse(typedAction.input);
      PackageOperationsReducer.setPackagePublisherUrlOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_PACKAGE_KEYWORDS":
      z.SetPackageKeywordsInputSchema().parse(typedAction.input);
      PackageOperationsReducer.setPackageKeywordsOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_PACKAGE_GITHUB_URL":
      z.SetPackageGithubUrlInputSchema().parse(typedAction.input);
      PackageOperationsReducer.setPackageGithubUrlOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_PACKAGE_NPM_URL":
      z.SetPackageNpmUrlInputSchema().parse(typedAction.input);
      PackageOperationsReducer.setPackageNpmUrlOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    default:
      return state;
  }
};

export const reducer = createReducer<VetraPackageDocument>(stateReducer);
