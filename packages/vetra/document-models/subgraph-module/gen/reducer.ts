// TODO: remove eslint-disable rules once refactor is done

import type { StateReducer } from "document-model";
import { isDocumentAction, createReducer } from "document-model/core";
import type { SubgraphModulePHState } from "@powerhousedao/vetra/document-models/subgraph-module";

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
    case "SET_SUBGRAPH_NAME":
      SetSubgraphNameInputSchema().parse(action.input);
      subgraphModuleBaseOperationsOperations.setSubgraphNameOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_SUBGRAPH_STATUS":
      SetSubgraphStatusInputSchema().parse(action.input);
      subgraphModuleBaseOperationsOperations.setSubgraphStatusOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;

    default:
      return state;
  }
};

export const reducer = createReducer<SubgraphModulePHState>(stateReducer);
