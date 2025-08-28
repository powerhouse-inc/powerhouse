import type { StateReducer } from "document-model";
import { isDocumentAction, createReducer } from "document-model";
import type { SubgraphModuleDocument } from "./types.js";
import { z } from "./types.js";

import { reducer as BaseOperationsReducer } from "../src/reducers/base-operations.js";

const stateReducer: StateReducer<SubgraphModuleDocument> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }

  switch (action.type) {
    case "SET_SUBGRAPH_NAME":
      z.SetSubgraphNameInputSchema().parse(action.input);
      BaseOperationsReducer.setSubgraphNameOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_SUBGRAPH_STATUS":
      z.SetSubgraphStatusInputSchema().parse(action.input);
      BaseOperationsReducer.setSubgraphStatusOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;

    default:
      return state;
  }
};

export const reducer = createReducer<SubgraphModuleDocument>(stateReducer);
