/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { Reducer, StateReducer } from "document-model";
import { createReducer, isDocumentAction } from "document-model";
import type { SubgraphModulePHState } from "document-models/subgraph-module/v1";

import { subgraphModuleBaseOperationsOperations } from "../src/reducers/base-operations.js";

import {
  SetSubgraphNameInputSchema,
  SetSubgraphStatusInputSchema,
} from "./schema/zod.js";

const stateReducer: StateReducer<SubgraphModulePHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "SET_SUBGRAPH_NAME": {
      SetSubgraphNameInputSchema().parse(action.input);

      subgraphModuleBaseOperationsOperations.setSubgraphNameOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_SUBGRAPH_STATUS": {
      SetSubgraphStatusInputSchema().parse(action.input);

      subgraphModuleBaseOperationsOperations.setSubgraphStatusOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    default:
      return state;
  }
};

export const reducer: Reducer<SubgraphModulePHState> =
  createReducer(stateReducer);
