import type { ConnectionHealthOperations } from "document-models/connection/v1";

export const connectionHealthOperations: ConnectionHealthOperations = {
  recordCheckResultOperation(state, action) {
    state.status = action.input.status;
    state.lastCheckedAt = action.input.checkedAt;
    state.lastError = action.input.error || null;
  },
};
