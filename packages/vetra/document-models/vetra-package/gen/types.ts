import type { PHDocument, ExtendedState } from "document-model";
import type { VetraPackageState } from "./schema/types.js";
import type { VetraPackageAction } from "./actions.js";

export { z } from "./schema/index.js";
export type * from "./schema/types.js";
type VetraPackageLocalState = Record<PropertyKey, never>;
export type ExtendedVetraPackageState = ExtendedState<
  VetraPackageState,
  VetraPackageLocalState
>;
export type VetraPackageDocument = PHDocument<
  VetraPackageState,
  VetraPackageLocalState,
  VetraPackageAction
>;
export type { VetraPackageState, VetraPackageLocalState, VetraPackageAction };
