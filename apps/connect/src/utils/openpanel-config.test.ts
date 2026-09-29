import { describe, expect, it } from "vitest";
import { resolveOpenPanelConfig } from "./openpanel-config.js";

const emptyEnv = {
  PH_CONNECT_OPENPANEL_CLIENT_ID: undefined,
  PH_CONNECT_OPENPANEL_API_URL: undefined,
  PH_CONNECT_OPENPANEL_TRACK_UI_EVENTS: true,
  PH_CONNECT_OPENPANEL_TRACK_OPERATIONS: true,
};

describe("resolveOpenPanelConfig", () => {
  it("enables OpenPanel from the runtime config when the build env is empty", () => {
    expect(
      resolveOpenPanelConfig(
        { clientId: "runtime-id", apiUrl: "https://op.example/api" },
        emptyEnv,
      ),
    ).toEqual({
      clientId: "runtime-id",
      apiUrl: "https://op.example/api",
      trackUiEvents: true,
      trackOperations: true,
    });
  });

  it("prefers the runtime config over the build-time env", () => {
    expect(
      resolveOpenPanelConfig(
        {
          clientId: "runtime-id",
          apiUrl: "https://runtime.example/api",
          trackUiEvents: false,
          trackOperations: false,
        },
        {
          PH_CONNECT_OPENPANEL_CLIENT_ID: "env-id",
          PH_CONNECT_OPENPANEL_API_URL: "https://env.example/api",
          PH_CONNECT_OPENPANEL_TRACK_UI_EVENTS: true,
          PH_CONNECT_OPENPANEL_TRACK_OPERATIONS: true,
        },
      ),
    ).toEqual({
      clientId: "runtime-id",
      apiUrl: "https://runtime.example/api",
      trackUiEvents: false,
      trackOperations: false,
    });
  });

  it("falls back to the build-time env when the runtime leaves fields empty", () => {
    expect(
      resolveOpenPanelConfig(
        { clientId: "", trackUiEvents: undefined },
        {
          PH_CONNECT_OPENPANEL_CLIENT_ID: "env-id",
          PH_CONNECT_OPENPANEL_API_URL: "https://env.example/api",
          PH_CONNECT_OPENPANEL_TRACK_UI_EVENTS: false,
          PH_CONNECT_OPENPANEL_TRACK_OPERATIONS: false,
        },
      ),
    ).toEqual({
      clientId: "env-id",
      apiUrl: "https://env.example/api",
      trackUiEvents: false,
      trackOperations: false,
    });
  });

  it("stays disabled (empty clientId) when neither runtime nor env set it", () => {
    const resolved = resolveOpenPanelConfig(undefined, emptyEnv);
    expect(resolved.clientId).toBe("");
    expect(resolved.apiUrl).toBeUndefined();
  });
});
