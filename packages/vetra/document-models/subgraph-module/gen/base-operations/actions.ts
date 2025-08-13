import { type Action } from "document-model";
import type { SetSubgraphNameInput } from "../types.js";

export type SetSubgraphNameAction = Action & {
  type: "SET_SUBGRAPH_NAME";
  input: SetSubgraphNameInput;
};

export type SubgraphModuleBaseOperationsAction = SetSubgraphNameAction;
