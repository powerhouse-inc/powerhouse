import type { VetraPackageBaseOperationsOperations } from "../../gen/base-operations/operations.js";

export const reducer: VetraPackageBaseOperationsOperations = {
  setPackageNameOperation(state, action, dispatch) {
    state.name = action.input.name;
  },
  setPackageDescriptionOperation(state, action, dispatch) {
    state.description = action.input.description;
  },
  setPackageCategoryOperation(state, action, dispatch) {
    state.category = action.input.category;
  },
  setPackageAuthorOperation(state, action, dispatch) {
    state.author = {
      name: action.input.name ?? null,
      website: action.input.website ?? null,
    };
  },
  setPackageAuthorNameOperation(state, action, dispatch) {
    state.author.name = action.input.name;
  },
  setPackageAuthorWebsiteOperation(state, action, dispatch) {
    state.author.website = action.input.website;
  },
  addPackageKeywordOperation(state, action, dispatch) {
    state.keywords.push(action.input);
  },
  removePackageKeywordOperation(state, action, dispatch) {
    state.keywords = state.keywords.filter(
      (keyword) => keyword.id !== action.input.id,
    );
  },
  setPackageGithubUrlOperation(state, action, dispatch) {
    state.githubUrl = action.input.url;
  },
  setPackageNpmUrlOperation(state, action, dispatch) {
    state.npmUrl = action.input.url;
  },
};
