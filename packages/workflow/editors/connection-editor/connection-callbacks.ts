// The document side of ConnectionForm: form callbacks mapped onto connection
// actions. Shared by this editor and the workflow editor's create modal.
import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import { generateId } from "document-model";
import {
  actions,
  type ConnectionAction,
  type ConnectionState,
} from "document-models/connection";
import type { ConnectionCallbacks } from "./connection-form.js";
import { connectorIdForPiece, planFromAuth } from "./piece-auth.js";

export function connectionCallbacks(
  state: ConnectionState,
  dispatch: DocumentDispatch<ConnectionAction>,
): ConnectionCallbacks {
  return {
    setName: (name) => {
      dispatch(actions.setConnectionName({ name }));
      dispatch(actions.setName(name));
    },
    pickPiece: (piece) => {
      const plan = planFromAuth(piece.auth);
      dispatch(
        actions.setConnector({
          connectorId: connectorIdForPiece(piece.name),
          authType: plan.authType,
        }),
      );
    },
    setConfigValue: (name, value) => {
      const config = {
        ...((state.config ?? {}) as Record<string, unknown>),
      };
      if (value === undefined) delete config[name];
      else config[name] = value;
      dispatch(actions.setConfig({ config }));
    },
    setSecretRef: (name, ref) => {
      const existing = state.secretRefs.find((entry) => entry.name === name);
      dispatch(
        actions.setSecretRef({ id: existing?.id ?? generateId(), name, ref }),
      );
    },
    removeSecretRef: (name) => {
      const existing = state.secretRefs.find((entry) => entry.name === name);
      if (existing) dispatch(actions.removeSecretRef({ id: existing.id }));
    },
    setStatus: (status) => {
      dispatch(
        actions.recordCheckResult({
          status,
          checkedAt: new Date().toISOString(),
        }),
      );
    },
  };
}
