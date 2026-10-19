import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import {
  REACTOR_CONNECTOR_ID,
  reducer,
  setConfig,
  setConnector,
  setSecretRef,
  utils,
  type ConnectionAction,
  type ConnectionDocument,
} from "document-models/connection/v1";
import { describe, expect, it } from "vitest";
import { connectionCallbacks } from "./connection-callbacks.js";

// A connection set up with a CUSTOM_AUTH method: a config field and a token.
function customAuthConnection(): ConnectionDocument {
  let document = utils.createDocument();
  for (const action of [
    setConnector({
      connectorId: "@acme/piece-multi#multi",
      authType: "CUSTOM_AUTH",
    }),
    setConfig({ config: { region: "eu" } }),
    setSecretRef({ id: "ref-token", name: "token", ref: "secret://v1:aa" }),
    setSecretRef({ id: "ref-value", name: "value", ref: "secret://v1:bb" }),
  ]) {
    document = reducer(document, action);
  }
  return document;
}

describe("setAuthType", () => {
  it("keeps only the credentials the new sign-in method asks for", () => {
    let document = customAuthConnection();
    const dispatch: DocumentDispatch<ConnectionAction> = (action) => {
      if (!action) return;
      for (const one of Array.isArray(action) ? action : [action]) {
        document = reducer(document, one as ConnectionAction);
      }
    };
    connectionCallbacks(document.state.global, dispatch).setAuthType(
      "SECRET_TEXT",
      { config: [], secrets: ["value"] },
    );
    const state = document.state.global;
    expect(state.authType).toBe("SECRET_TEXT");
    expect(state.connectorId).toBe("@acme/piece-multi#multi");
    // SECRET_TEXT needs exactly one ref; a leftover token would fail every run.
    expect(state.secretRefs.map((ref) => ref.name)).toEqual(["value"]);
    expect(state.config).toEqual({});
  });
});

describe("reactor connections", () => {
  function editing(document: ConnectionDocument) {
    let current = document;
    const dispatch: DocumentDispatch<ConnectionAction> = (action) => {
      if (!action) return;
      for (const one of Array.isArray(action) ? action : [action]) {
        current = reducer(current, one as ConnectionAction);
      }
    };
    return {
      callbacks: () => connectionCallbacks(current.state.global, dispatch),
      state: () => current.state.global,
      errors: () =>
        current.operations.global.flatMap((operation) =>
          operation.error ? [operation.error] : [],
        ),
    };
  }

  it("turns a piece connection into a ready reactor connection", () => {
    const connection = editing(customAuthConnection());
    connection.callbacks().pickReactor();
    expect(connection.errors()).toEqual([]);
    expect(connection.state()).toMatchObject({
      connectorId: REACTOR_CONNECTOR_ID,
      authType: "REACTOR",
      config: { endpoint: "local" },
      secretRefs: [],
      status: "OK",
    });
  });

  it("saves access the model accepts", () => {
    const connection = editing(utils.createDocument());
    connection.callbacks().pickReactor();
    connection.callbacks().setReactorAccess("read");
    expect(connection.errors()).toEqual([]);
    expect(connection.state().config).toEqual({
      endpoint: "local",
      access: "read",
    });
  });
});

// The editor builds callbacks from the last echoed state; a second edit made
// before the first echoes comes from those same, stale callbacks.
describe("edits made before the first one echoes", () => {
  function staleEditing(document: ConnectionDocument) {
    let current = document;
    const dispatch: DocumentDispatch<ConnectionAction> = (action) => {
      if (!action) return;
      for (const one of Array.isArray(action) ? action : [action]) {
        current = reducer(current, one as ConnectionAction);
      }
    };
    return {
      callbacks: connectionCallbacks(document.state.global, dispatch),
      state: () => current.state.global,
    };
  }

  it("keeps both of two config fields", () => {
    const connection = staleEditing(customAuthConnection());
    connection.callbacks.setConfigValue("sandbox", true);
    connection.callbacks.setConfigValue("region", "us");
    expect(connection.state().config).toEqual({
      region: "us",
      sandbox: true,
    });
  });

  it("keeps a field set before a field is cleared", () => {
    const connection = staleEditing(customAuthConnection());
    connection.callbacks.setConfigValue("sandbox", true);
    connection.callbacks.setConfigValue("region", undefined);
    expect(connection.state().config).toEqual({ sandbox: true });
  });

  it("repairs an invalid reactor config in one write", () => {
    let document = utils.createDocument();
    document = reducer(
      document,
      setConnector({ connectorId: REACTOR_CONNECTOR_ID, authType: "REACTOR" }),
    );
    // A config written before its connector became REACTOR skips validation.
    document = {
      ...document,
      state: {
        ...document.state,
        global: { ...document.state.global, config: { endpoint: "remote" } },
      },
    };
    const connection = staleEditing(document);
    connection.callbacks.setReactorAccess("read");
    expect(connection.state().config).toEqual({
      endpoint: "local",
      access: "read",
    });
  });
});
