import {
  REACTOR_CONNECTOR_ID,
  reducer,
  setConfig,
  setConnector,
  setSecretRef,
  utils,
  type ConnectionDocument,
} from "document-models/connection/v1";
import { describe, expect, it } from "vitest";

function lastError(document: ConnectionDocument): string | undefined {
  return document.operations.global.at(-1)?.error;
}

function reactorConnection(): ConnectionDocument {
  return reducer(
    utils.createDocument(),
    setConnector({ connectorId: REACTOR_CONNECTOR_ID, authType: "REACTOR" }),
  );
}

describe("reactor connections", () => {
  it("binds the reserved connector with a local endpoint and no secrets", () => {
    const document = reactorConnection();
    expect(lastError(document)).toBeUndefined();
    expect(document.state.global.authType).toBe("REACTOR");
    expect(document.state.global.connectorId).toBe(REACTOR_CONNECTOR_ID);
    expect(document.state.global.config).toEqual({ endpoint: "local" });
    expect(document.state.global.secretRefs).toEqual([]);
  });

  it("refuses REACTOR with another connector, and the reserved id with another auth type", () => {
    const other = reducer(
      utils.createDocument(),
      setConnector({ connectorId: "@acme/piece-x#x", authType: "REACTOR" }),
    );
    expect(lastError(other)).toMatch(/only with authType REACTOR/);
    expect(other.state.global.authType).toBe("NONE");

    const reserved = reducer(
      utils.createDocument(),
      setConnector({ connectorId: REACTOR_CONNECTOR_ID, authType: "NONE" }),
    );
    expect(lastError(reserved)).toMatch(/only with authType REACTOR/);
    expect(reserved.state.global.connectorId).toBe("");
  });

  it("stores a read-only config", () => {
    const document = reducer(
      reactorConnection(),
      setConfig({ config: { endpoint: "local", access: "read" } }),
    );
    expect(lastError(document)).toBeUndefined();
    expect(document.state.global.config).toEqual({
      endpoint: "local",
      access: "read",
    });
  });

  it.each([
    [{ endpoint: "https://remote.example" }, /endpoint must be "local"/],
    [{ endpoint: "local", access: "write" }, /access must be "read"/],
    [
      { endpoint: "local", filter: { documentType: ["x"] } },
      /Unknown reactor connection field "filter"/,
    ],
    [{ endpoint: "local", scope: "all" }, /Unknown reactor connection field/],
    [{ access: "read" }, /./],
  ])("refuses the invalid config %j", (config, message) => {
    const before = reactorConnection();
    const document = reducer(before, setConfig({ config }));
    expect(lastError(document)).toMatch(message);
    expect(document.state.global.config).toEqual({ endpoint: "local" });
  });

  it("refuses secret refs", () => {
    const document = reducer(
      reactorConnection(),
      setSecretRef({ id: "sr-1", name: "token", ref: "vault://x" }),
    );
    expect(lastError(document)).toBe("A reactor connection holds no secrets");
    expect(document.state.global.secretRefs).toEqual([]);
  });

  it("leaves other auth types' config unvalidated", () => {
    let document = reducer(
      utils.createDocument(),
      setConnector({ connectorId: "@acme/piece-x#x", authType: "CUSTOM_AUTH" }),
    );
    document = reducer(document, setConfig({ config: { anything: 1 } }));
    expect(lastError(document)).toBeUndefined();
    expect(document.state.global.config).toEqual({ anything: 1 });
  });

  it("resets a rebound connection's config for its new kind", () => {
    let document = reducer(
      utils.createDocument(),
      setConnector({ connectorId: "@acme/piece-x#x", authType: "CUSTOM_AUTH" }),
    );
    document = reducer(document, setConfig({ config: { base_url: "x" } }));
    document = reducer(
      document,
      setSecretRef({ id: "sr-1", name: "token", ref: "vault://x" }),
    );
    document = reducer(
      document,
      setConnector({ connectorId: REACTOR_CONNECTOR_ID, authType: "REACTOR" }),
    );
    expect(document.state.global.config).toEqual({ endpoint: "local" });
    expect(document.state.global.secretRefs).toEqual([]);
  });
});
