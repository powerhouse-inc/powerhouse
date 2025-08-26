import type { PHDocument } from "document-model";
import type { SubgraphModuleAction } from "./actions.js";
import type { SubgraphModulePHState } from "./ph-factories.js";
import type { SubgraphModuleState } from "./schema/types.js";

export { z } from "./schema/index.js";
export type * from "./schema/types.js";
type SubgraphModuleLocalState = Record<PropertyKey, never>;
export type SubgraphModuleDocument = PHDocument<SubgraphModulePHState>;
export type {
  SubgraphModuleState,
  SubgraphModuleLocalState,
  SubgraphModuleAction,
};
