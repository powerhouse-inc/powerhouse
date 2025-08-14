import type { PHDocument, ExtendedState } from "document-model";
import type { SubgraphModuleState } from "./schema/types.js";
import type { SubgraphModuleAction } from "./actions.js";

export { z } from "./schema/index.js";
export type * from "./schema/types.js";
type SubgraphModuleLocalState = Record<PropertyKey, never>;
export type ExtendedSubgraphModuleState = ExtendedState<
  SubgraphModuleState,
  SubgraphModuleLocalState
>;
export type SubgraphModuleDocument = PHDocument<
  SubgraphModuleState,
  SubgraphModuleLocalState
>;
export type {
  SubgraphModuleState,
  SubgraphModuleLocalState,
  SubgraphModuleAction,
};
