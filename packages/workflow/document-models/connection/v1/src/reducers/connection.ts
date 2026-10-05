import type { ConnectionConnectionOperations } from "document-models/connection/v1";

export const connectionConnectionOperations: ConnectionConnectionOperations = {
  setConnectionNameOperation(state, action) {
    state.name = action.input.name;
  },
  setConnectorOperation(state, action) {
    const rebinding = action.input.connectorId !== state.connectorId;
    state.connectorId = action.input.connectorId;
    state.authType = action.input.authType;
    state.status = "UNCONFIGURED";
    // A different connector invalidates the old one's config/secrets/health;
    // a same-connector call (e.g. re-declaring authType) leaves them alone.
    if (rebinding) {
      state.config = {};
      state.secretRefs = [];
      state.accountLabel = null;
      state.lastCheckedAt = null;
      state.lastError = null;
    }
  },
  setAccountLabelOperation(state, action) {
    state.accountLabel = action.input.accountLabel || null;
  },
};
