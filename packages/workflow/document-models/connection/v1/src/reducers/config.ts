import type { ConnectionConfigOperations } from "document-models/connection/v1";
import { SecretRefNotFoundError } from "../../gen/config/error.js";

export const connectionConfigOperations: ConnectionConfigOperations = {
  setConfigOperation(state, action) {
    state.config = action.input.config;
  },
  setSecretRefOperation(state, action) {
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
