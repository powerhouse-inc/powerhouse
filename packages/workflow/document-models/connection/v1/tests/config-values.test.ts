import {
  REACTOR_CONNECTOR_ID,
  reducer,
  removeConfigValue,
  setConfig,
  setConfigValue,
  setConnector,
  utils,
  type ConnectionAction,
  type ConnectionDocument,
} from "document-models/connection/v1";
import { describe, expect, it } from "vitest";

function apply(
  document: ConnectionDocument,
  ...actions: ConnectionAction[]
): ConnectionDocument {
  return actions.reduce(
    (current, action) => reducer(current, action),
    document,
  );
}

function lastError(document: ConnectionDocument): string | undefined {
  return document.operations.global.at(-1)?.error;
}

function withConfig(config: unknown): ConnectionDocument {
  return apply(utils.createDocument(), setConfig({ config }));
}

describe("SET_CONFIG_VALUE", () => {
  it("changes only its own field", () => {
    const document = apply(
      withConfig({ region: "eu", sandbox: false }),
      setConfigValue({ name: "sandbox", value: true }),
    );
    expect(lastError(document)).toBeUndefined();
    expect(document.state.global.config).toEqual({
      region: "eu",
      sandbox: true,
    });
  });

  it("keeps both of two edits applied in order", () => {
    const document = apply(
      withConfig({ region: "eu" }),
      setConfigValue({ name: "sandbox", value: true }),
      setConfigValue({ name: "region", value: "us" }),
    );
    expect(document.state.global.config).toEqual({
      region: "us",
      sandbox: true,
    });
  });

  it("starts a fresh object over a config that is not one", () => {
    const document = apply(
      withConfig("legacy"),
      setConfigValue({ name: "region", value: "eu" }),
    );
    expect(document.state.global.config).toEqual({ region: "eu" });
  });

  it("removes the field when the value is undefined", () => {
    const document = apply(
      withConfig({ region: "eu", sandbox: true }),
      setConfigValue({ name: "sandbox", value: undefined }),
    );
    expect(document.state.global.config).toEqual({ region: "eu" });
  });
});

describe("REMOVE_CONFIG_VALUE", () => {
  it("removes only its own field", () => {
    const document = apply(
      withConfig({ region: "eu", sandbox: true }),
      removeConfigValue({ name: "sandbox" }),
    );
    expect(lastError(document)).toBeUndefined();
    expect(document.state.global.config).toEqual({ region: "eu" });
  });

  it("changes nothing when the field is absent", () => {
    const document = apply(
      withConfig({ region: "eu" }),
      removeConfigValue({ name: "sandbox" }),
    );
    expect(lastError(document)).toBeUndefined();
    expect(document.state.global.config).toEqual({ region: "eu" });
  });

  it("keeps a set made before it", () => {
    const document = apply(
      withConfig({ region: "eu", sandbox: true }),
      setConfigValue({ name: "region", value: "us" }),
      removeConfigValue({ name: "sandbox" }),
    );
    expect(document.state.global.config).toEqual({ region: "us" });
  });
});

describe("config fields on a REACTOR connection", () => {
  function reactorConnection(): ConnectionDocument {
    return apply(
      utils.createDocument(),
      setConnector({ connectorId: REACTOR_CONNECTOR_ID, authType: "REACTOR" }),
    );
  }

  it("sets and removes access", () => {
    const readOnly = apply(
      reactorConnection(),
      setConfigValue({ name: "access", value: "read" }),
    );
    expect(lastError(readOnly)).toBeUndefined();
    expect(readOnly.state.global.config).toEqual({
      endpoint: "local",
      access: "read",
    });
    const readWrite = apply(readOnly, removeConfigValue({ name: "access" }));
    expect(lastError(readWrite)).toBeUndefined();
    expect(readWrite.state.global.config).toEqual({ endpoint: "local" });
  });

  it("refuses a field that leaves the config invalid", () => {
    const unknown = apply(
      reactorConnection(),
      setConfigValue({ name: "token", value: "x" }),
    );
    expect(lastError(unknown)).toMatch(/Unknown reactor connection field/);
    expect(unknown.state.global.config).toEqual({ endpoint: "local" });

    const removed = apply(
      reactorConnection(),
      removeConfigValue({ name: "endpoint" }),
    );
    expect(lastError(removed)).toBeDefined();
    expect(removed.state.global.config).toEqual({ endpoint: "local" });
  });
});
