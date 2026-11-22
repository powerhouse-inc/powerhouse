/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { PHBaseState, PHDocument } from "document-model";
import type { BrandSheetAction } from "./actions.js";
import type { BrandSheetState as BrandSheetGlobalState } from "./schema/types.js";

type BrandSheetLocalState = Record<PropertyKey, never>;

type BrandSheetPHState = PHBaseState & {
  global: BrandSheetGlobalState;
  local: BrandSheetLocalState;
};
type BrandSheetDocument = PHDocument<BrandSheetPHState>;

export * from "./schema/types.js";

export type {
  BrandSheetAction,
  BrandSheetDocument,
  BrandSheetGlobalState,
  BrandSheetLocalState,
  BrandSheetPHState,
};
