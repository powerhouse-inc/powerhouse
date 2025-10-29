import type { SubgraphModuleBaseOperationsOperations } from "../../gen/base-operations/operations.js";
import type { SubgraphModuleBaseOperationsOperations } from "@powerhousedao/vetra/document-models/subgraph-module";

export const reducer: SubgraphModuleBaseOperationsOperations = {
  setSubgraphNameOperation(state, action, dispatch) {
    const trimmedName = action.input.name.trim();
    if (trimmedName === "") {
      throw new Error("Subgraph name cannot be empty");
    }
    state.name = trimmedName;
  },
  setSubgraphStatusOperation(state, action, dispatch) {
    state.status = action.input.status;
  },
};
export const subgraphModuleBaseOperationsOperations: SubgraphModuleBaseOperationsOperations = {
    setSubgraphNameOperation(state, action) {
        // TODO: Implement "setSubgraphNameOperation" reducer
        throw new Error('Reducer "setSubgraphNameOperation" not yet implemented');
    },
    setSubgraphStatusOperation(state, action) {
        // TODO: Implement "setSubgraphStatusOperation" reducer
        throw new Error('Reducer "setSubgraphStatusOperation" not yet implemented');
    }
};
