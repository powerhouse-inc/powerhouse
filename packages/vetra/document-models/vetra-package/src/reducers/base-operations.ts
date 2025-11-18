import type { VetraPackageBaseOperationsOperations } from "@powerhousedao/vetra/document-models/vetra-package";

export const vetraPackageBaseOperationsOperations: VetraPackageBaseOperationsOperations =
  {
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
      // Check for duplicate ID
      const existingId = state.keywords.find(
        (keyword) => keyword.id === action.input.id,
      );
      if (existingId) {
        throw new Error(`Keyword with id "${action.input.id}" already exists`);
      }

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
