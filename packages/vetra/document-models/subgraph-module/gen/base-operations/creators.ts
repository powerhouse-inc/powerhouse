import { createAction } from "document-model/core";
import {
  SetSubgraphNameInputSchema,
  SetSubgraphStatusInputSchema,
} from "../schema/zod.js";
import type { SetSubgraphNameInput, SetSubgraphStatusInput } from "../types.js";
import type {
  SetSubgraphNameAction,
  SetSubgraphStatusAction,
} from "./actions.js";

export const setSubgraphName = (input: SetSubgraphNameInput) =>
  createAction<SetSubgraphNameAction>(
    "SET_SUBGRAPH_NAME",
    { ...input },
    undefined,
    SetSubgraphNameInputSchema,
    "global",
  );

export const setSubgraphStatus = (input: SetSubgraphStatusInput) =>
  createAction<SetSubgraphStatusAction>(
    "SET_SUBGRAPH_STATUS",
    { ...input },
    undefined,
    SetSubgraphStatusInputSchema,
    "global",
  );
