import { type SignalDispatch } from "document-model";
import {
  type SetSubgraphNameAction,
  type SetSubgraphStatusAction,
} from "./actions.js";
import { type SubgraphModuleState } from "../types.js";

export interface SubgraphModuleBaseOperationsOperations {
  setSubgraphNameOperation: (
    state: SubgraphModuleState,
    action: SetSubgraphNameAction,
    dispatch?: SignalDispatch,
  ) => void;
  setSubgraphStatusOperation: (
    state: SubgraphModuleState,
    action: SetSubgraphStatusAction,
    dispatch?: SignalDispatch,
  ) => void;
}
