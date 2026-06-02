import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOpenPanelClient, resetOpenPanelClient } from "./client.js";

// vi.hoisted ensures the spy is initialized before vi.mock's factory executes.
// This allows the mock factory to close over the spy and lets the test suite
// assert on it across all test cases.
//
// The implementation must be a regular `function` (not an arrow) so that it
// can be invoked with `new` inside client.ts.
const MockOpenPanel = vi.hoisted(() =>
  vi.fn(function (this: Record<string, unknown>, opts: unknown) {
    this.options = opts;
    this.track = vi.fn();
    this.setGlobalProperties = vi.fn();
  }),
);

// Intercepts both the static type import (no-op) and the runtime dynamic
// `await import("@openpanel/web")` inside getOpenPanelClient.
vi.mock("@openpanel/web", () => ({
  OpenPanel: MockOpenPanel,
}));

const BASE_CONFIG = {
  clientId: "test-client-id",
  trackUiEvents: true,
  trackOperations: true,
};

describe("getOpenPanelClient", () => {
  beforeEach(() => {
    resetOpenPanelClient();
    vi.clearAllMocks();
  });

  it("returns the same instance on repeated calls", async () => {
    const first = await getOpenPanelClient(BASE_CONFIG);
    const second = await getOpenPanelClient(BASE_CONFIG);

    expect(first).toBeDefined();
    expect(first).toBe(second);
    expect(MockOpenPanel).toHaveBeenCalledTimes(1);
  });

  it("builds a fresh instance after resetOpenPanelClient()", async () => {
    const first = await getOpenPanelClient(BASE_CONFIG);

    resetOpenPanelClient();
    vi.clearAllMocks();

    const second = await getOpenPanelClient(BASE_CONFIG);

    expect(second).toBeDefined();
    expect(second).not.toBe(first);
    expect(MockOpenPanel).toHaveBeenCalledTimes(1);
  });

  it("returns undefined when clientId is empty — SDK is not imported", async () => {
    const result = await getOpenPanelClient({ ...BASE_CONFIG, clientId: "" });

    expect(result).toBeUndefined();
    // The dynamic import is guarded by the clientId check, so the OpenPanel
    // constructor must never be called.
    expect(MockOpenPanel).not.toHaveBeenCalled();
  });

  it("passes clientId and apiUrl to the constructor when both are provided", async () => {
    const config = { ...BASE_CONFIG, apiUrl: "https://custom.example.com" };
    await getOpenPanelClient(config);

    expect(MockOpenPanel).toHaveBeenCalledWith({
      clientId: "test-client-id",
      apiUrl: "https://custom.example.com",
      trackScreenViews: true,
      trackOutgoingLinks: true,
    });
  });

  it("omits apiUrl from constructor options when not provided", async () => {
    await getOpenPanelClient(BASE_CONFIG);

    expect(MockOpenPanel).toHaveBeenCalledWith({
      clientId: "test-client-id",
      trackScreenViews: true,
      trackOutgoingLinks: true,
    });
  });

  it("enables automatic screen-view and outgoing-link tracking", async () => {
    await getOpenPanelClient(BASE_CONFIG);

    expect(MockOpenPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        trackScreenViews: true,
        trackOutgoingLinks: true,
      }),
    );
  });

  it("stamps the app segmentation global property after construction", async () => {
    const client = await getOpenPanelClient(BASE_CONFIG);

    expect(client).toBeDefined();
    expect(client?.setGlobalProperties).toHaveBeenCalledWith({
      app: "connect",
    });
  });
});
