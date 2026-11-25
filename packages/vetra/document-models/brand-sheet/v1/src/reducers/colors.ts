import type { BrandSheetColorsOperations } from "document-models/brand-sheet/v1";
import {
  ColorNotFoundError,
  DuplicateColorIdError,
} from "../../gen/colors/error.js";
import { insertItem, reorderById } from "../reorder.js";

export const brandSheetColorsOperations: BrandSheetColorsOperations = {
  addColorOperation(state, action) {
    if (state.colors.some((c) => c.id === action.input.id)) {
      throw new DuplicateColorIdError(
        `Color ${action.input.id} already exists.`,
      );
    }
    insertItem(
      state.colors,
      {
        id: action.input.id,
        role: action.input.role,
        name: action.input.name,
        hex: action.input.hex,
        usage: action.input.usage,
      },
      action.input.insertBefore ?? null,
    );
  },
  updateColorOperation(state, action) {
    const color = state.colors.find((c) => c.id === action.input.id);
    if (!color) {
      throw new ColorNotFoundError(`Color ${action.input.id} not found.`);
    }
    if (action.input.role) color.role = action.input.role;
    if (action.input.name) color.name = action.input.name;
    if (action.input.hex) color.hex = action.input.hex;
    if (action.input.usage) color.usage = action.input.usage;
  },
  removeColorOperation(state, action) {
    const index = state.colors.findIndex((c) => c.id === action.input.id);
    if (index === -1) {
      throw new ColorNotFoundError(`Color ${action.input.id} not found.`);
    }
    state.colors.splice(index, 1);
  },
  reorderColorsOperation(state, action) {
    for (const id of action.input.ids) {
      if (!state.colors.some((c) => c.id === id)) {
        throw new ColorNotFoundError(`Color ${id} not found.`);
      }
    }
    reorderById(
      state.colors,
      action.input.ids,
      action.input.insertBefore ?? null,
    );
  },
};
