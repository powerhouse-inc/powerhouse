// The actions that turn a new powerhouse/connection document into a REACTOR
// connection, read-only for a block that only reads.
import {
  actions as connectionActions,
  REACTOR_CONNECTOR_ID,
} from "document-models/connection";

export function newReactorConnectionActions(
  name: string,
  requireReactor: "read" | "write",
) {
  return [
    connectionActions.setConnectionName({ name }),
    connectionActions.setName(name),
    connectionActions.setConnector({
      connectorId: REACTOR_CONNECTOR_ID,
      authType: "REACTOR",
    }),
    connectionActions.setConfig({
      config:
        requireReactor === "read"
          ? { endpoint: "local", access: "read" }
          : { endpoint: "local" },
    }),
    // Nothing to fill in, so it is ready as made.
    connectionActions.recordCheckResult({
      status: "OK",
      checkedAt: new Date().toISOString(),
    }),
  ];
}
