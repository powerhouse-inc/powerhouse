/**
 * This is a scaffold file meant for customization:
 * - modify it by implementing the reducer functions
 * - delete the file and run the code generator again to have it reset
 */

import type { VetraPackagePackageOperationsOperations } from "../../gen/package-operations/operations.js";

export const reducer: VetraPackagePackageOperationsOperations = {
  setPackageNameOperation(state, action, dispatch) {
    state.name = action.input.name;
  },
  setPackageDescriptionOperation(state, action, dispatch) {
    state.description = action.input.description || null;
  },
  setPackageCategoryOperation(state, action, dispatch) {
    state.category = action.input.category;
  },
  setPackagePublisherOperation(state, action, dispatch) {
    state.publisher = action.input.publisher || null;
  },
  setPackagePublisherUrlOperation(state, action, dispatch) {
    state.publisherUrl = action.input.url || null;
  },
  setPackageKeywordsOperation(state, action, dispatch) {
    state.keywords = action.input.keywords;
  },
  setPackageGithubUrlOperation(state, action, dispatch) {
    state.githubUrl = action.input.url || null;
  },
  setPackageNpmUrlOperation(state, action, dispatch) {
    state.npmUrl = action.input.url || null;
  },
};
