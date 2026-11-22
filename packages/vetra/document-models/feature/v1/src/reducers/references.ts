import type { FeatureReferencesOperations } from "document-models/feature/v1";
import {
  ParentFeatureNotSetError,
  RelatedStepNotSetError,
  RoleNotSetError,
  WbsNotSetError,
} from "../../gen/references/error.js";

export const featureReferencesOperations: FeatureReferencesOperations = {
  setRoleOperation(state, action) {
    state.role = {
      documentId: action.input.documentId,
      objectId: action.input.objectId,
      name: action.input.name ?? null,
      kind: action.input.kind ?? null,
    };
  },
  updateRoleSnippetOperation(state, action) {
    if (!state.role) throw new RoleNotSetError("No role reference is set.");
    if (action.input.name) state.role.name = action.input.name;
    if (action.input.kind) state.role.kind = action.input.kind;
  },
  clearRoleOperation(state) {
    state.role = null;
  },
  setRelatedStepOperation(state, action) {
    state.relatedStep = {
      documentId: action.input.documentId,
      objectId: action.input.objectId,
      name: action.input.name ?? null,
      category: action.input.category ?? null,
    };
  },
  updateRelatedStepSnippetOperation(state, action) {
    if (!state.relatedStep) {
      throw new RelatedStepNotSetError("No related-step reference is set.");
    }
    if (action.input.name) state.relatedStep.name = action.input.name;
    if (action.input.category)
      state.relatedStep.category = action.input.category;
  },
  clearRelatedStepOperation(state) {
    state.relatedStep = null;
  },
  setParentFeatureOperation(state, action) {
    state.parentFeature = {
      documentId: action.input.documentId,
      name: action.input.name ?? null,
      status: action.input.status ?? null,
    };
  },
  updateParentFeatureSnippetOperation(state, action) {
    if (!state.parentFeature) {
      throw new ParentFeatureNotSetError("No parent-feature reference is set.");
    }
    if (action.input.name) state.parentFeature.name = action.input.name;
    if (action.input.status) state.parentFeature.status = action.input.status;
  },
  clearParentFeatureOperation(state) {
    state.parentFeature = null;
  },
  setWbsOperation(state, action) {
    state.wbs = {
      documentId: action.input.documentId,
      name: action.input.name ?? null,
      status: action.input.status ?? null,
    };
  },
  updateWbsSnippetOperation(state, action) {
    if (!state.wbs) throw new WbsNotSetError("No WBS reference is set.");
    if (action.input.name) state.wbs.name = action.input.name;
    if (action.input.status) state.wbs.status = action.input.status;
  },
  clearWbsOperation(state) {
    state.wbs = null;
  },
};
