import type { BrandSheetTypographyOperations } from "document-models/brand-sheet/v1";
import {
  DuplicateTypefaceIdError,
  TypefaceNotFoundError,
} from "../../gen/typography/error.js";
import { insertItem, reorderById } from "../reorder.js";

export const brandSheetTypographyOperations: BrandSheetTypographyOperations = {
  addTypefaceOperation(state, action) {
    if (state.typography.some((t) => t.id === action.input.id)) {
      throw new DuplicateTypefaceIdError(
        `Typeface ${action.input.id} already exists.`,
      );
    }
    insertItem(
      state.typography,
      {
        id: action.input.id,
        role: action.input.role,
        family: action.input.family,
        alternatives: action.input.alternatives,
        notes: action.input.notes ?? null,
      },
      action.input.insertBefore ?? null,
    );
  },
  updateTypefaceOperation(state, action) {
    const typeface = state.typography.find((t) => t.id === action.input.id);
    if (!typeface) {
      throw new TypefaceNotFoundError(`Typeface ${action.input.id} not found.`);
    }
    if (action.input.role) typeface.role = action.input.role;
    if (action.input.family) typeface.family = action.input.family;
    if (action.input.alternatives) {
      typeface.alternatives = action.input.alternatives;
    }
    if (action.input.notes) typeface.notes = action.input.notes;
  },
  removeTypefaceOperation(state, action) {
    const index = state.typography.findIndex((t) => t.id === action.input.id);
    if (index === -1) {
      throw new TypefaceNotFoundError(`Typeface ${action.input.id} not found.`);
    }
    state.typography.splice(index, 1);
  },
  reorderTypefacesOperation(state, action) {
    for (const id of action.input.ids) {
      if (!state.typography.some((t) => t.id === id)) {
        throw new TypefaceNotFoundError(`Typeface ${id} not found.`);
      }
    }
    reorderById(
      state.typography,
      action.input.ids,
      action.input.insertBefore ?? null,
    );
  },
};
