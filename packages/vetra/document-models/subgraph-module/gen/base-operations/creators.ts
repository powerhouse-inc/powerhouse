import { createAction } from "document-model";
import { z, type SetSubgraphNameInput } from "../types.js";
import { type SetSubgraphNameAction } from "./actions.js";

export const setSubgraphName = (input: SetSubgraphNameInput) =>
  createAction<SetSubgraphNameAction>(
    "SET_SUBGRAPH_NAME",
    { ...input },
    undefined,
    z.SetSubgraphNameInputSchema,
    "global",
  );
