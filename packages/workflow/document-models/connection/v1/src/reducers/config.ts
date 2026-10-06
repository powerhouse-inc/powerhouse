import type { ConnectionConfigOperations } from "document-models/connection/v1";
import {
  InvalidReactorConfigError,
  ReactorSecretRefError,
  SecretRefNotFoundError,
} from "../../gen/config/error.js";
import { parseReactorConnectionConfig } from "../reactor-connection.js";

export const connectionConfigOperations: ConnectionConfigOperations = {
  setConfigOperation(state, action) {
    if (state.authType !== "REACTOR") {
      state.config = action.input.config;
      return;
    }
    const parsed = parseReactorConnectionConfig(action.input.config);
    if (!parsed.ok) throw new InvalidReactorConfigError(parsed.error);
    state.config = parsed.config;
  },
  setSecretRefOperation(state, action) {
    if (state.authType === "REACTOR") {
      throw new ReactorSecretRefError("A reactor connection holds no secrets");
    }
    const existing = state.secretRefs.find(
      (secretRef) => secretRef.name === action.input.name,
    );
    if (existing) {
      existing.ref = action.input.ref;
    } else {
      state.secretRefs.push({
        id: action.input.id,
        name: action.input.name,
        ref: action.input.ref,
      });
    }
  },
  removeSecretRefOperation(state, action) {
    const index = state.secretRefs.findIndex(
      (secretRef) => secretRef.id === action.input.id,
    );
    if (index === -1) {
      throw new SecretRefNotFoundError("Secret ref not found");
    }
    state.secretRefs.splice(index, 1);
  },
};
