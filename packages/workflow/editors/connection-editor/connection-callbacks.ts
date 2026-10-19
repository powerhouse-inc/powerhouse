// The document side of ConnectionForm: form callbacks mapped onto connection
// actions. Shared by this editor and the workflow editor's create modal.
import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import { generateId } from "document-model";
import {
  actions,
  defaultReactorConnectionConfig,
  parseReactorConnectionConfig,
  REACTOR_CONNECTOR_ID,
  type ConnectionAction,
  type ConnectionState,
} from "document-models/connection";
import type { ConnectionCallbacks } from "./connection-form.js";
import {
  connectorIdForPiece,
  planFromAuth,
  UNKNOWN_AUTH,
} from "./piece-auth.js";

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
      // An auth type this runtime doesn't know is never stored as another.
      if (plan.authType === UNKNOWN_AUTH) return;
      dispatch(
        actions.setConnector({
          connectorId: connectorIdForPiece(piece.name),
          authType: plan.authType,
        }),
      );
    },
    // Same connector, another sign-in method: only the fields the new method
    // asks for survive, so a SECRET_TEXT never carries a CUSTOM_AUTH token.
    setAuthType: (authType, keep) => {
      dispatch(
        actions.setConnector({ connectorId: state.connectorId, authType }),
      );
      for (const name of Object.keys(configFields(state.config))) {
        if (!keep.config.includes(name)) {
          dispatch(actions.removeConfigValue({ name }));
        }
      }
      for (const ref of state.secretRefs) {
        if (!keep.secrets.includes(ref.name)) {
          dispatch(actions.removeSecretRef({ id: ref.id }));
        }
      }
    },
    // One field per write, so a second edit before the echo keeps the first.
    setConfigValue: (name, value) => {
      dispatch(
        value === undefined
          ? actions.removeConfigValue({ name })
          : actions.setConfigValue({ name, value }),
      );
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
    // Nothing to fill in, so it is ready once picked.
    pickReactor: () => {
      dispatch(
        actions.setConnector({
          connectorId: REACTOR_CONNECTOR_ID,
          authType: "REACTOR",
        }),
      );
      dispatch(actions.setConfig({ config: defaultReactorConnectionConfig() }));
      dispatch(
        actions.recordCheckResult({
          status: "OK",
          checkedAt: new Date().toISOString(),
        }),
      );
    },
    setReactorAccess: (access) => {
      if (parseReactorConnectionConfig(state.config).ok) {
        dispatch(
          access === "read"
            ? actions.setConfigValue({ name: "access", value: "read" })
            : actions.removeConfigValue({ name: "access" }),
        );
      } else {
        // An invalid config can't take one field; replace it whole.
        dispatch(
          actions.setConfig({
            config: {
              ...defaultReactorConnectionConfig(),
              ...(access === "read" ? { access } : {}),
            },
          }),
        );
      }
      if (state.status === "UNCONFIGURED") {
        dispatch(
          actions.recordCheckResult({
            status: "OK",
            checkedAt: new Date().toISOString(),
          }),
        );
      }
    },
  };
}

function configFields(config: unknown): Record<string, unknown> {
  return config !== null && typeof config === "object" && !Array.isArray(config)
    ? (config as Record<string, unknown>)
    : {};
}
