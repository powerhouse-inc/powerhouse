import type { BrandSheetIdentityOperations } from "document-models/brand-sheet/v1";

export const brandSheetIdentityOperations: BrandSheetIdentityOperations = {
  setProductNameOperation(state, action) {
    state.name = action.input.name;
  },
  clearProductNameOperation(state) {
    state.name = null;
  },
  setMaximOperation(state, action) {
    state.maxim = action.input.maxim;
  },
  clearMaximOperation(state) {
    state.maxim = null;
  },
  setConceptOperation(state, action) {
    state.concept = action.input.concept;
  },
  clearConceptOperation(state) {
    state.concept = null;
  },
};
