import {
  recordCheckResult,
  reducer,
  removeSecretRef,
  setAccountLabel,
  setConfig,
  setConnectionName,
  setConnector,
  setSecretRef,
  utils,
} from "document-models/connection/v1";
import { describe, expect, it } from "vitest";

describe("connection scenarios", () => {
  it("configures a connection end to end", () => {
    let document = utils.createDocument();
    document = reducer(document, setConnectionName({ name: "Ops Gotify" }));
    document = reducer(
      document,
      setConnector({
        connectorId: "@activepieces/piece-gotify#gotify",
        authType: "CUSTOM_AUTH",
      }),
    );
    document = reducer(
      document,
      setConfig({ config: { base_url: "https://gotify.example" } }),
    );
    document = reducer(
      document,
      setSecretRef({
        id: "sr-1",
        name: "app_token",
        ref: "vault://ops/gotify",
      }),
    );
    document = reducer(
      document,
      setAccountLabel({ accountLabel: "ops@example.com" }),
    );
    document = reducer(
      document,
      recordCheckResult({
        status: "OK",
        checkedAt: "2026-09-01T12:00:00.000Z",
      }),
    );

    const state = document.state.global;
    expect(state.name).toBe("Ops Gotify");
    expect(state.connectorId).toBe("@activepieces/piece-gotify#gotify");
    expect(state.authType).toBe("CUSTOM_AUTH");
    expect(state.config).toEqual({ base_url: "https://gotify.example" });
    expect(state.secretRefs).toEqual([
      { id: "sr-1", name: "app_token", ref: "vault://ops/gotify" },
    ]);
    expect(state.accountLabel).toBe("ops@example.com");
    expect(state.status).toBe("OK");
    expect(state.lastCheckedAt).toBe("2026-09-01T12:00:00.000Z");
    expect(state.lastError).toBeNull();
    expect(document.operations.global.every((op) => !op.error)).toBe(true);
  });

  it("resets status when the connector binding changes", () => {
    let document = utils.createDocument();
    document = reducer(
      document,
      setConnector({ connectorId: "a#x", authType: "SECRET_TEXT" }),
    );
    document = reducer(
      document,
      recordCheckResult({
        status: "OK",
        checkedAt: "2026-09-01T12:00:00.000Z",
      }),
    );
    document = reducer(
      document,
      setConnector({ connectorId: "b#y", authType: "OAUTH2" }),
    );
    expect(document.state.global.status).toBe("UNCONFIGURED");
    expect(document.state.global.authType).toBe("OAUTH2");
  });

  it("upserts secret refs by name and removes them by id", () => {
    let document = utils.createDocument();
    document = reducer(
      document,
      setSecretRef({ id: "sr-1", name: "token", ref: "vault://a" }),
    );
    document = reducer(
      document,
      setSecretRef({ id: "sr-2", name: "token", ref: "vault://b" }),
    );
    let state = document.state.global;
    expect(state.secretRefs).toEqual([
      { id: "sr-1", name: "token", ref: "vault://b" },
    ]);

    document = reducer(
      document,
      setSecretRef({ id: "sr-3", name: "password", ref: "vault://c" }),
    );
    expect(document.state.global.secretRefs).toHaveLength(2);

    document = reducer(document, removeSecretRef({ id: "sr-1" }));
    state = document.state.global;
    expect(state.secretRefs.map((secretRef) => secretRef.name)).toEqual([
      "password",
    ]);

    document = reducer(document, removeSecretRef({ id: "sr-1" }));
    expect(document.operations.global[4].error).toBe("Secret ref not found");
    expect(document.state.global.secretRefs).toHaveLength(1);
  });

  it("records failed checks and clears the label and error", () => {
    let document = utils.createDocument();
    document = reducer(
      document,
      recordCheckResult({
        status: "ERROR",
        checkedAt: "2026-09-01T12:00:00.000Z",
        error: "401 unauthorized",
      }),
    );
    expect(document.state.global.status).toBe("ERROR");
    expect(document.state.global.lastError).toBe("401 unauthorized");

    document = reducer(
      document,
      recordCheckResult({
        status: "OK",
        checkedAt: "2026-09-01T13:00:00.000Z",
      }),
    );
    expect(document.state.global.lastError).toBeNull();

    document = reducer(
      document,
      setAccountLabel({ accountLabel: "user@example.com" }),
    );
    document = reducer(document, setAccountLabel({}));
    expect(document.state.global.accountLabel).toBeNull();
  });
});
