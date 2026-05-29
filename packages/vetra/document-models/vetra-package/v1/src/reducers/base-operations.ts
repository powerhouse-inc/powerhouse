import type { VetraPackageBaseOperationsOperations } from "document-models/vetra-package/v1";

export const vetraPackageBaseOperationsOperations: VetraPackageBaseOperationsOperations =
  {
    setPackageNameOperation(state, action, _dispatch) {
      state.name = action.input.name;
    },
    setPackageDescriptionOperation(state, action, _dispatch) {
      state.description = action.input.description;
    },
    setPackageCategoryOperation(state, action, _dispatch) {
      state.category = action.input.category;
    },
    setPackageAuthorOperation(state, action, _dispatch) {
      state.author = {
        name: action.input.name ?? null,
        website: action.input.website ?? null,
      };
    },
    setPackageAuthorNameOperation(state, action, _dispatch) {
      state.author.name = action.input.name;
    },
    setPackageAuthorWebsiteOperation(state, action, _dispatch) {
      state.author.website = action.input.website;
    },
    addPackageKeywordOperation(state, action, _dispatch) {
      // Check for duplicate ID
      const existingId = state.keywords.find(
        (keyword) => keyword.id === action.input.id,
      );
      if (existingId) {
        throw new Error(`Keyword with id "${action.input.id}" already exists`);
      }

      state.keywords.push(action.input);
    },
    removePackageKeywordOperation(state, action, _dispatch) {
      state.keywords = state.keywords.filter(
        (keyword) => keyword.id !== action.input.id,
      );
    },
    setPackageGithubUrlOperation(state, action, _dispatch) {
      state.githubUrl = action.input.url;
    },
    setPackageNpmUrlOperation(state, action, _dispatch) {
      state.npmUrl = action.input.url;
    },
  };
