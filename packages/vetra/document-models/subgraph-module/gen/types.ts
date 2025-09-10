import type { PHDocument } from "document-model";
import type { SubgraphModuleAction } from "./actions.js";
import type { SubgraphModulePHState } from "./ph-factories.js";
import type { SubgraphModuleState } from "./schema/types.js";

export { z } from "./schema/index.js";
export type * from "./schema/types.js";
type SubgraphModuleLocalState = Record<PropertyKey, never>;
export type ExtendedsubgraphmoduleState =
  BaseStateFromDocument<SubgraphModuleDocument>;
export type SubgraphModuleDocument = PHDocument<
  SubgraphModuleState,
  SubgraphModuleLocalState
>;
export type {
  SubgraphModuleState,
  SubgraphModuleLocalState,
  SubgraphModuleAction,
};
