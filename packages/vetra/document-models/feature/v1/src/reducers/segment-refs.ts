import type { FeatureSegmentRefsOperations } from "document-models/feature/v1";
import {
  DuplicateSegmentRefIdError,
  SegmentRefNotFoundError,
} from "../../gen/segment-refs/error.js";
import { insertItem, reorderById } from "../reorder.js";

export const featureSegmentRefsOperations: FeatureSegmentRefsOperations = {
  addSegmentRefOperation(state, action) {
    if (state.segments.some((s) => s.id === action.input.id)) {
      throw new DuplicateSegmentRefIdError(
        `Segment reference ${action.input.id} already exists.`,
      );
    }
    insertItem(
      state.segments,
      {
        id: action.input.id,
        documentId: action.input.documentId,
        objectId: action.input.objectId,
        name: action.input.name ?? null,
        description: action.input.description ?? null,
      },
      action.input.insertBefore ?? null,
    );
  },
  updateSegmentRefSnippetOperation(state, action) {
    const ref = state.segments.find((s) => s.id === action.input.id);
    if (!ref) {
      throw new SegmentRefNotFoundError(
        `Segment reference ${action.input.id} not found.`,
      );
    }
    if (action.input.name) ref.name = action.input.name;
    if (action.input.description) ref.description = action.input.description;
  },
  removeSegmentRefOperation(state, action) {
    const index = state.segments.findIndex((s) => s.id === action.input.id);
    if (index === -1) {
      throw new SegmentRefNotFoundError(
        `Segment reference ${action.input.id} not found.`,
      );
    }
    state.segments.splice(index, 1);
  },
  reorderSegmentRefsOperation(state, action) {
    for (const id of action.input.ids) {
      if (!state.segments.some((s) => s.id === id)) {
        throw new SegmentRefNotFoundError(`Segment reference ${id} not found.`);
      }
    }
    reorderById(
      state.segments,
      action.input.ids,
      action.input.insertBefore ?? null,
    );
  },
};
