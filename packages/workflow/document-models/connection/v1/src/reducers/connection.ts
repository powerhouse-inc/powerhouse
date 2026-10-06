import type { ConnectionConnectionOperations } from "document-models/connection/v1";
import { ReservedConnectorError } from "../../gen/connection/error.js";
import {
  defaultReactorConnectionConfig,
  isReactorConnectorId,
} from "../reactor-connection.js";

export const connectionConnectionOperations: ConnectionConnectionOperations = {
  setConnectionNameOperation(state, action) {
    state.name = action.input.name;
  },
  setConnectorOperation(state, action) {
    const reactor = action.input.authType === "REACTOR";
    if (reactor !== isReactorConnectorId(action.input.connectorId)) {
      throw new ReservedConnectorError(
        "The reactor connector id goes only with authType REACTOR",
      );
    }
    const rebinding = action.input.connectorId !== state.connectorId;
    state.connectorId = action.input.connectorId;
    state.authType = action.input.authType;
    state.status = "UNCONFIGURED";
    // A different connector invalidates the old one's config/secrets/health;
    // a same-connector call (e.g. re-declaring authType) leaves them alone.
    if (rebinding) {
      state.config = reactor ? defaultReactorConnectionConfig() : {};
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
