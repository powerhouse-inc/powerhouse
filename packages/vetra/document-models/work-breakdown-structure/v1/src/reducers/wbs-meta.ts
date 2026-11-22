import type { WorkBreakdownStructureWbsMetaOperations } from "document-models/work-breakdown-structure/v1";
import { FeatureNotSetError } from "../../gen/wbs-meta/error.js";

export const workBreakdownStructureWbsMetaOperations: WorkBreakdownStructureWbsMetaOperations =
  {
    setWbsNameOperation(state, action) {
      state.name = action.input.name;
    },
    clearWbsNameOperation(state) {
      state.name = null;
    },
    setWbsDescriptionOperation(state, action) {
      state.description = action.input.description;
    },
    clearWbsDescriptionOperation(state) {
      state.description = null;
    },
    setFeatureOperation(state, action) {
      state.feature = {
        documentId: action.input.documentId,
        name: action.input.name ?? null,
        status: action.input.status ?? null,
      };
    },
    updateFeatureSnippetOperation(state, action) {
      if (!state.feature) {
        throw new FeatureNotSetError("No Feature reference is set.");
      }
      if (action.input.name) state.feature.name = action.input.name;
      if (action.input.status) state.feature.status = action.input.status;
    },
    clearFeatureOperation(state) {
      state.feature = null;
    },
  };
