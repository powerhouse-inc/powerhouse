import type { Action } from "document-model";
import type { SetSubgraphNameInput, SetSubgraphStatusInput } from "../types.js";

export type SetSubgraphNameAction = Action & {
  type: "SET_SUBGRAPH_NAME";
  input: SetSubgraphNameInput;
};
export type SetSubgraphStatusAction = Action & {
  type: "SET_SUBGRAPH_STATUS";
  input: SetSubgraphStatusInput;
};

export type SubgraphModuleBaseOperationsAction =
  | SetSubgraphNameAction
  | SetSubgraphStatusAction;
