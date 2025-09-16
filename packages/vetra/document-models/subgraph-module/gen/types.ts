import type { PHBaseState, PHDocument } from "document-model";
import type { SubgraphModuleAction } from "./actions.js";
import type { SubgraphModuleState as SubgraphModuleGlobalState } from "./schema/types.js";

export { z } from "./schema/index.js";
export * from "./schema/types.js";
type SubgraphModuleLocalState = Record<PropertyKey, never>;
type SubgraphModulePHState = PHBaseState & {
  global: SubgraphModuleGlobalState;
  local: SubgraphModuleLocalState;
};
type SubgraphModuleDocument = PHDocument<SubgraphModulePHState>;

export type {
  SubgraphModuleAction,
  SubgraphModuleDocument,
  SubgraphModuleGlobalState,
  SubgraphModuleLocalState,
  SubgraphModulePHState,
};
