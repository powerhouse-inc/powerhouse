import type { PHDocument, BaseStateFromDocument } from "document-model";
import type { VetraPackageState } from "./schema/types.js";
import type { VetraPackageAction } from "./actions.js";

export { z } from "./schema/index.js";
export type * from "./schema/types.js";
type VetraPackageLocalState = Record<PropertyKey, never>;
export type ExtendedvetrapackageState = BaseStateFromDocument<VetraPackageDocument>;
export type VetraPackageDocument = PHDocument<
  VetraPackageState,
  VetraPackageLocalState
>;
export type { VetraPackageState, VetraPackageLocalState, VetraPackageAction };
