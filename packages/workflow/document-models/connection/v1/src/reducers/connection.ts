import type { ConnectionConnectionOperations } from "document-models/connection/v1";

export const connectionConnectionOperations: ConnectionConnectionOperations = {
  setConnectionNameOperation(state, action) {
    state.name = action.input.name;
  },
  setConnectorOperation(state, action) {
    state.connectorId = action.input.connectorId;
    state.authType = action.input.authType;
    state.status = "UNCONFIGURED";
  },
  setAccountLabelOperation(state, action) {
    state.accountLabel = action.input.accountLabel || null;
  },
};
