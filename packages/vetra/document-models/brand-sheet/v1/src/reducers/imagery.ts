import type { BrandSheetImageryOperations } from "document-models/brand-sheet/v1";
import type { BrandSheetGlobalState, Imagery } from "../../gen/types.js";
import {
  DuplicateImageReferenceIdError,
  ImageReferenceNotFoundError,
} from "../../gen/imagery/error.js";
import { insertItem, reorderById } from "../reorder.js";

function getOrCreateImagery(state: BrandSheetGlobalState): Imagery {
  if (!state.imagery) {
    state.imagery = { direction: null, include: [], avoid: [], references: [] };
  }
  return state.imagery;
}

export const brandSheetImageryOperations: BrandSheetImageryOperations = {
  setImageryDirectionOperation(state, action) {
    getOrCreateImagery(state).direction = action.input.direction;
  },
  clearImageryDirectionOperation(state) {
    if (state.imagery) state.imagery.direction = null;
  },
  setImageryGuidanceOperation(state, action) {
    const imagery = getOrCreateImagery(state);
    imagery.include = action.input.include;
    imagery.avoid = action.input.avoid;
  },
  addImageryReferenceOperation(state, action) {
    const imagery = getOrCreateImagery(state);
    if (imagery.references.some((r) => r.id === action.input.id)) {
      throw new DuplicateImageReferenceIdError(
        `Image reference ${action.input.id} already exists.`,
      );
    }
    insertItem(
      imagery.references,
      {
        id: action.input.id,
        data: action.input.data ?? null,
        mediaType: action.input.mediaType ?? null,
        filename: action.input.filename ?? null,
        url: action.input.url ?? null,
      },
      action.input.insertBefore ?? null,
    );
  },
  removeImageryReferenceOperation(state, action) {
    const references = state.imagery?.references ?? [];
    const index = references.findIndex((r) => r.id === action.input.id);
    if (index === -1) {
      throw new ImageReferenceNotFoundError(
        `Image reference ${action.input.id} not found.`,
      );
    }
    references.splice(index, 1);
  },
  reorderImageryReferencesOperation(state, action) {
    const references = state.imagery?.references ?? [];
    for (const id of action.input.ids) {
      if (!references.some((r) => r.id === id)) {
        throw new ImageReferenceNotFoundError(
          `Image reference ${id} not found.`,
        );
      }
    }
    reorderById(
      references,
      action.input.ids,
      action.input.insertBefore ?? null,
    );
  },
};
