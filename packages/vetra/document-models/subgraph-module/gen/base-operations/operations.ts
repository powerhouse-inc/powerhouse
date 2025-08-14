import { type SignalDispatch } from "document-model";
import { type SetSubgraphNameAction } from "./actions.js";
import { type SubgraphModuleState } from "../types.js";

export interface SubgraphModuleBaseOperationsOperations {
  setSubgraphNameOperation: (
    state: SubgraphModuleState,
    action: SetSubgraphNameAction,
    dispatch?: SignalDispatch,
  ) => void;
}
