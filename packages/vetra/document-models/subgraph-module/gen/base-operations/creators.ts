import { createAction } from "document-model";
import type { SetSubgraphNameInput, SetSubgraphStatusInput } from "../types.js";
import { z } from "../types.js";
import type {
  SetSubgraphNameAction,
  SetSubgraphStatusAction,
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
