/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { PHBaseState, PHDocument } from "document-model";
import type { SubgraphModuleAction } from "./actions.js";
import type { SubgraphModuleState as SubgraphModuleGlobalState } from "./schema/types.js";

type SubgraphModuleLocalState = Record<PropertyKey, never>;

type SubgraphModulePHState = PHBaseState & {
  global: SubgraphModuleGlobalState;
  local: SubgraphModuleLocalState;
};
type SubgraphModuleDocument = PHDocument<SubgraphModulePHState>;

export * from "./schema/types.js";

export type {
  SubgraphModuleAction,
  SubgraphModuleDocument,
  SubgraphModuleGlobalState,
  SubgraphModuleLocalState,
  SubgraphModulePHState,
};
