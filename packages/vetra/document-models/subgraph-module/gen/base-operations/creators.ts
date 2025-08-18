import { createAction } from "document-model";
import {
  z,
  type SetSubgraphNameInput,
  type SetSubgraphStatusInput,
} from "../types.js";
import {
  type SetSubgraphNameAction,
  type SetSubgraphStatusAction,
} from "./actions.js";

export const setSubgraphName = (input: SetSubgraphNameInput) =>
  createAction<SetSubgraphNameAction>(
    "SET_SUBGRAPH_NAME",
    { ...input },
    undefined,
    z.SetSubgraphNameInputSchema,
    "global",
  );

export const setSubgraphStatus = (input: SetSubgraphStatusInput) =>
  createAction<SetSubgraphStatusAction>(
    "SET_SUBGRAPH_STATUS",
    { ...input },
    undefined,
    z.SetSubgraphStatusInputSchema,
    "global",
  );
