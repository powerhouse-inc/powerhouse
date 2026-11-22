/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  AddLogoInputSchema,
  ClearLogoAssetInputSchema,
  RemoveLogoInputSchema,
  ReorderLogosInputSchema,
  SetLogoAssetInputSchema,
  UpdateLogoInputSchema,
} from "../schema/zod.js";
import type {
  AddLogoInput,
  ClearLogoAssetInput,
  RemoveLogoInput,
  ReorderLogosInput,
  SetLogoAssetInput,
  UpdateLogoInput,
} from "../types.js";
import type {
  AddLogoAction,
  ClearLogoAssetAction,
  RemoveLogoAction,
  ReorderLogosAction,
  SetLogoAssetAction,
  UpdateLogoAction,
} from "./actions.js";

export const addLogo = (input: AddLogoInput) =>
  createAction<AddLogoAction>(
    "ADD_LOGO",
    { ...input },
    undefined,
    AddLogoInputSchema,
    "global",
  );

export const updateLogo = (input: UpdateLogoInput) =>
  createAction<UpdateLogoAction>(
    "UPDATE_LOGO",
    { ...input },
    undefined,
    UpdateLogoInputSchema,
    "global",
  );

export const setLogoAsset = (input: SetLogoAssetInput) =>
  createAction<SetLogoAssetAction>(
    "SET_LOGO_ASSET",
    { ...input },
    undefined,
    SetLogoAssetInputSchema,
    "global",
  );

export const clearLogoAsset = (input: ClearLogoAssetInput) =>
  createAction<ClearLogoAssetAction>(
    "CLEAR_LOGO_ASSET",
    { ...input },
    undefined,
    ClearLogoAssetInputSchema,
    "global",
  );

export const removeLogo = (input: RemoveLogoInput) =>
  createAction<RemoveLogoAction>(
    "REMOVE_LOGO",
    { ...input },
    undefined,
    RemoveLogoInputSchema,
    "global",
  );

export const reorderLogos = (input: ReorderLogosInput) =>
  createAction<ReorderLogosAction>(
    "REORDER_LOGOS",
    { ...input },
    undefined,
    ReorderLogosInputSchema,
    "global",
  );
