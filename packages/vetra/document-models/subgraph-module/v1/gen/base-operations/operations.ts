/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { SubgraphModuleGlobalState } from "../types.js";
import type {
  SetSubgraphNameAction,
  SetSubgraphStatusAction,
} from "./actions.js";

export interface SubgraphModuleBaseOperationsOperations {
  setSubgraphNameOperation: (
    state: SubgraphModuleGlobalState,
    action: SetSubgraphNameAction,
    dispatch?: SignalDispatch,
  ) => void;
  setSubgraphStatusOperation: (
    state: SubgraphModuleGlobalState,
    action: SetSubgraphStatusAction,
    dispatch?: SignalDispatch,
  ) => void;
}
