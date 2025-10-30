import type { VetraPackageBaseOperationsOperations } from "@powerhousedao/vetra/document-models/vetra-package";

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
export const vetraPackageBaseOperationsOperations: VetraPackageBaseOperationsOperations =
  {
    setPackageNameOperation(state, action) {
      // TODO: Implement "setPackageNameOperation" reducer
      throw new Error('Reducer "setPackageNameOperation" not yet implemented');
    },
    setPackageDescriptionOperation(state, action) {
      // TODO: Implement "setPackageDescriptionOperation" reducer
      throw new Error(
        'Reducer "setPackageDescriptionOperation" not yet implemented',
      );
    },
    setPackageCategoryOperation(state, action) {
      // TODO: Implement "setPackageCategoryOperation" reducer
      throw new Error(
        'Reducer "setPackageCategoryOperation" not yet implemented',
      );
    },
    setPackageAuthorOperation(state, action) {
      // TODO: Implement "setPackageAuthorOperation" reducer
      throw new Error(
        'Reducer "setPackageAuthorOperation" not yet implemented',
      );
    },
    setPackageAuthorNameOperation(state, action) {
      // TODO: Implement "setPackageAuthorNameOperation" reducer
      throw new Error(
        'Reducer "setPackageAuthorNameOperation" not yet implemented',
      );
    },
    setPackageAuthorWebsiteOperation(state, action) {
      // TODO: Implement "setPackageAuthorWebsiteOperation" reducer
      throw new Error(
        'Reducer "setPackageAuthorWebsiteOperation" not yet implemented',
      );
    },
    addPackageKeywordOperation(state, action) {
      // TODO: Implement "addPackageKeywordOperation" reducer
      throw new Error(
        'Reducer "addPackageKeywordOperation" not yet implemented',
      );
    },
    removePackageKeywordOperation(state, action) {
      // TODO: Implement "removePackageKeywordOperation" reducer
      throw new Error(
        'Reducer "removePackageKeywordOperation" not yet implemented',
      );
    },
    setPackageGithubUrlOperation(state, action) {
      // TODO: Implement "setPackageGithubUrlOperation" reducer
      throw new Error(
        'Reducer "setPackageGithubUrlOperation" not yet implemented',
      );
    },
    setPackageNpmUrlOperation(state, action) {
      // TODO: Implement "setPackageNpmUrlOperation" reducer
      throw new Error(
        'Reducer "setPackageNpmUrlOperation" not yet implemented',
      );
    },
  };
