import type { PHDocument } from "document-model";
import type { VetraPackageAction } from "./actions.js";
import type { VetraPackagePHState } from "./ph-factories.js";
import type { VetraPackageState } from "./schema/types.js";

export { z } from "./schema/index.js";
export type * from "./schema/types.js";
type VetraPackageLocalState = Record<PropertyKey, never>;
export type VetraPackageDocument = PHDocument<VetraPackagePHState>;
export type { VetraPackageState, VetraPackageLocalState, VetraPackageAction };
