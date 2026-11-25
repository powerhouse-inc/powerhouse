import type { BrandSheetLogosOperations } from "document-models/brand-sheet/v1";
import {
  DuplicateLogoIdError,
  LogoNotFoundError,
} from "../../gen/logos/error.js";
import { insertItem, reorderById } from "../reorder.js";

export const brandSheetLogosOperations: BrandSheetLogosOperations = {
  addLogoOperation(state, action) {
    if (state.logos.some((l) => l.id === action.input.id)) {
      throw new DuplicateLogoIdError(`Logo ${action.input.id} already exists.`);
    }
    insertItem(
      state.logos,
      {
        id: action.input.id,
        description: action.input.description,
        markType: action.input.markType,
        assetData: null,
        assetMediaType: null,
        assetFilename: null,
        assetUrl: null,
      },
      action.input.insertBefore ?? null,
    );
  },
  updateLogoOperation(state, action) {
    const logo = state.logos.find((l) => l.id === action.input.id);
    if (!logo)
      throw new LogoNotFoundError(`Logo ${action.input.id} not found.`);
    if (action.input.description) logo.description = action.input.description;
    if (action.input.markType) logo.markType = action.input.markType;
  },
  setLogoAssetOperation(state, action) {
    const logo = state.logos.find((l) => l.id === action.input.logoId);
    if (!logo) {
      throw new LogoNotFoundError(`Logo ${action.input.logoId} not found.`);
    }
    if (action.input.data) logo.assetData = action.input.data;
    if (action.input.mediaType) logo.assetMediaType = action.input.mediaType;
    if (action.input.filename) logo.assetFilename = action.input.filename;
    if (action.input.url) logo.assetUrl = action.input.url;
  },
  clearLogoAssetOperation(state, action) {
    const logo = state.logos.find((l) => l.id === action.input.logoId);
    if (!logo) {
      throw new LogoNotFoundError(`Logo ${action.input.logoId} not found.`);
    }
    logo.assetData = null;
    logo.assetMediaType = null;
    logo.assetFilename = null;
    logo.assetUrl = null;
  },
  removeLogoOperation(state, action) {
    const index = state.logos.findIndex((l) => l.id === action.input.id);
    if (index === -1) {
      throw new LogoNotFoundError(`Logo ${action.input.id} not found.`);
    }
    state.logos.splice(index, 1);
  },
  reorderLogosOperation(state, action) {
    for (const id of action.input.ids) {
      if (!state.logos.some((l) => l.id === id)) {
        throw new LogoNotFoundError(`Logo ${id} not found.`);
      }
    }
    reorderById(
      state.logos,
      action.input.ids,
      action.input.insertBefore ?? null,
    );
  },
};
