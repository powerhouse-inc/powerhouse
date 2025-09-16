import type { PHBaseState, PHDocument } from "document-model";
import type { VetraPackageAction } from "./actions.js";
import type { VetraPackageState as VetraPackageGlobalState } from "./schema/types.js";

export { z } from "./schema/index.js";
export * from "./schema/types.js";
type VetraPackageLocalState = Record<PropertyKey, never>;
type VetraPackagePHState = PHBaseState & {
  global: VetraPackageGlobalState;
  local: VetraPackageLocalState;
};
type VetraPackageDocument = PHDocument<VetraPackagePHState>;

export type {
  VetraPackageAction,
  VetraPackageDocument,
  VetraPackageGlobalState,
  VetraPackageLocalState,
  VetraPackagePHState,
};
