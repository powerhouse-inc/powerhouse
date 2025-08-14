import type { SubgraphModuleBaseOperationsOperations } from "../../gen/base-operations/operations.js";

export const reducer: SubgraphModuleBaseOperationsOperations = {
    setSubgraphNameOperation(state, action, dispatch) {
        state.name = action.input.name;
    }
};
