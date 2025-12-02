import type { PHDocument, PHBaseState } from "document-model";
import type { VetraPackageAction } from "./actions.js";
import type { VetraPackageState as VetraPackageGlobalState } from "./schema/types.js";

type VetraPackageLocalState = Record<PropertyKey, never>;

type VetraPackagePHState = PHBaseState & {
  global: VetraPackageGlobalState;
  local: VetraPackageLocalState;
};
type VetraPackageDocument = PHDocument<VetraPackagePHState>;

export * from "./schema/types.js";

export type {
  VetraPackageGlobalState,
  VetraPackageLocalState,
  VetraPackagePHState,
  VetraPackageAction,
  VetraPackageDocument,
};
