import type { FeatureEvidenceOperations } from "document-models/feature/v1";
import {
  DuplicateEvidenceIdError,
  EvidenceNotFoundError,
} from "../../gen/evidence/error.js";
import { insertItem } from "../reorder.js";

export const featureEvidenceOperations: FeatureEvidenceOperations = {
  addEvidenceOperation(state, action) {
    if (state.evidence.some((e) => e.id === action.input.id)) {
      throw new DuplicateEvidenceIdError(
        `Evidence ${action.input.id} already exists.`,
      );
    }
    insertItem(
      state.evidence,
      {
        id: action.input.id,
        source: action.input.source,
        content: action.input.content,
        recordedAt: action.input.recordedAt ?? null,
      },
      action.input.insertBefore ?? null,
    );
  },
  updateEvidenceOperation(state, action) {
    const evidence = state.evidence.find((e) => e.id === action.input.id);
    if (!evidence) {
      throw new EvidenceNotFoundError(`Evidence ${action.input.id} not found.`);
    }
    if (action.input.source) evidence.source = action.input.source;
    if (action.input.content) evidence.content = action.input.content;
    if (action.input.recordedAt) evidence.recordedAt = action.input.recordedAt;
  },
  removeEvidenceOperation(state, action) {
    const index = state.evidence.findIndex((e) => e.id === action.input.id);
    if (index === -1) {
      throw new EvidenceNotFoundError(`Evidence ${action.input.id} not found.`);
    }
    state.evidence.splice(index, 1);
  },
};
