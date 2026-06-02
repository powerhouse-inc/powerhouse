// @vitest-environment happy-dom

import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mock factories — must run before vi.mock() factory functions
// ---------------------------------------------------------------------------

const mockClient = vi.hoisted(() => ({
  identify: vi.fn(),
  clear: vi.fn(),
  track: vi.fn(),
  flush: vi.fn(),
}));

const mockGetOpenPanelClient = vi.hoisted(() => vi.fn());
const mockResetOpenPanelClient = vi.hoisted(() => vi.fn());
const mockCreateOpenPanelProcessorFactory = vi.hoisted(() => vi.fn());

const mockProcessorManager = vi.hoisted(() => ({
  registerFactory: vi.fn(),
  unregisterFactory: vi.fn(),
}));

const mockUseUser = vi.hoisted(() => vi.fn());
const mockUseReactorClientModule = vi.hoisted(() => vi.fn());
const mockUseAcceptedCookies = vi.hoisted(() => vi.fn());

/**
 * Mutable config object so individual tests can override `clientId` etc.
 * without re-mocking the whole module.
 */
const mockConnectConfig = vi.hoisted(() => ({
  openPanel: {
    clientId: "test-client-id",
    trackOperations: true,
    trackUiEvents: true,
    apiUrl: undefined as string | undefined,
  },
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@powerhousedao/connect/services", () => ({
  getOpenPanelClient: mockGetOpenPanelClient,
  resetOpenPanelClient: mockResetOpenPanelClient,
  createOpenPanelProcessorFactory: mockCreateOpenPanelProcessorFactory,
  eventMappings: [],
  eventLookupMap: new Map(),
}));

vi.mock("@powerhousedao/connect/config", () => ({
  connectConfig: mockConnectConfig,
}));

vi.mock("@powerhousedao/connect/hooks", () => ({
  useAcceptedCookies: mockUseAcceptedCookies,
}));

vi.mock("@powerhousedao/reactor-browser", () => ({
  useUser: mockUseUser,
  useReactorClientModule: mockUseReactorClientModule,
}));

// Import the component after mocks are registered (vitest hoists vi.mock to
// the top automatically, so this ordering is for readability only).
import { OpenPanel } from "./openpanel.js";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const MOCK_USER = {
  did: "did:pkh:eip155:1:0xabc",
  address: "0xabc123" as `0x${string}`,
  networkId: "eip155:1",
  chainId: 1,
  credential: undefined,
};

/** Resets every mock to a known baseline before each test. */
function setupDefaults() {
  // Reset mutated config fields
  mockConnectConfig.openPanel.clientId = "test-client-id";
  mockConnectConfig.openPanel.trackOperations = true;

  // Re-apply return values that vi.clearAllMocks() wiped
  mockGetOpenPanelClient.mockResolvedValue(mockClient);
  mockClient.identify.mockResolvedValue(undefined);
  mockClient.clear.mockResolvedValue(undefined);
  mockCreateOpenPanelProcessorFactory.mockReturnValue(vi.fn());
  mockProcessorManager.registerFactory.mockResolvedValue(undefined);
  mockProcessorManager.unregisterFactory.mockResolvedValue(undefined);

  mockUseUser.mockReturnValue(undefined);
  mockUseAcceptedCookies.mockReturnValue([{ analytics: true }, vi.fn()]);
  mockUseReactorClientModule.mockReturnValue({
    reactorModule: { processorManager: mockProcessorManager },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OpenPanel component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  // -----------------------------------------------------------------------
  // Gate: analytics consent off
  // -----------------------------------------------------------------------

  it("stays idle when analytics consent is off (no SDK init, no identify, no registerFactory)", async () => {
    mockUseAcceptedCookies.mockReturnValue([{ analytics: false }, vi.fn()]);

    render(<OpenPanel />);

    // Give effects time to potentially fire (they shouldn't)
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockGetOpenPanelClient).not.toHaveBeenCalled();
    expect(mockProcessorManager.registerFactory).not.toHaveBeenCalled();
    expect(mockClient.identify).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Gate: clientId empty
  // -----------------------------------------------------------------------

  it("stays idle when clientId is empty (no SDK init, no identify, no registerFactory)", async () => {
    mockConnectConfig.openPanel.clientId = "";

    render(<OpenPanel />);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockGetOpenPanelClient).not.toHaveBeenCalled();
    expect(mockProcessorManager.registerFactory).not.toHaveBeenCalled();
    expect(mockClient.identify).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Enabled, no user — client built, factory registered, no identify
  // -----------------------------------------------------------------------

  it("builds client and registers factory when enabled but no user is logged in", async () => {
    render(<OpenPanel />);

    await waitFor(() => {
      expect(mockGetOpenPanelClient).toHaveBeenCalledWith(
        mockConnectConfig.openPanel,
      );
      expect(mockProcessorManager.registerFactory).toHaveBeenCalledWith(
        "openpanel",
        expect.any(Function),
      );
    });

    // No user → identify must not have been called
    expect(mockClient.identify).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // User appears → identify called once with correct shape
  // -----------------------------------------------------------------------

  it("identifies user when login is detected (undefined → defined)", async () => {
    // Start with no user
    const { rerender } = render(<OpenPanel />);
    await waitFor(() => expect(mockGetOpenPanelClient).toHaveBeenCalled());

    // User logs in
    mockUseUser.mockReturnValue(MOCK_USER);
    rerender(<OpenPanel />);

    await waitFor(() => {
      expect(mockClient.identify).toHaveBeenCalledTimes(1);
    });

    const [identifyArg] = mockClient.identify.mock.calls[0] as [
      { profileId: string; properties: Record<string, unknown> },
    ];

    // profileId is top-level, not inside properties
    expect(identifyArg.profileId).toBe(MOCK_USER.address);

    // Core property fields present
    const { properties } = identifyArg;
    expect(properties.address).toBe(MOCK_USER.address);
    expect(properties.did).toBe(MOCK_USER.did);
    expect(properties.networkId).toBe(MOCK_USER.networkId);
    expect(properties.chainId).toBe(MOCK_USER.chainId);

    // credential must NEVER appear in properties
    expect("credential" in properties).toBe(false);
  });

  // -----------------------------------------------------------------------
  // User clears → clear() called, identify not re-fired
  // -----------------------------------------------------------------------

  it("calls clear on logout (defined → undefined) and does not re-identify", async () => {
    // Start already logged in
    mockUseUser.mockReturnValue(MOCK_USER);
    const { rerender } = render(<OpenPanel />);

    // Wait for identify to fire on initial login detection
    await waitFor(() => expect(mockClient.identify).toHaveBeenCalledTimes(1));

    // User logs out
    mockUseUser.mockReturnValue(undefined);
    rerender(<OpenPanel />);

    await waitFor(() => expect(mockClient.clear).toHaveBeenCalledTimes(1));

    // identify must not have been called a second time
    expect(mockClient.identify).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // Consent revoked → unregisterFactory + resetOpenPanelClient
  // -----------------------------------------------------------------------

  it("tears down (unregisterFactory + resetOpenPanelClient) when consent is revoked", async () => {
    const { rerender } = render(<OpenPanel />);

    // Wait for the factory to be registered
    await waitFor(() =>
      expect(mockProcessorManager.registerFactory).toHaveBeenCalled(),
    );

    // Revoke consent
    mockUseAcceptedCookies.mockReturnValue([{ analytics: false }, vi.fn()]);
    rerender(<OpenPanel />);

    await waitFor(() => {
      expect(mockProcessorManager.unregisterFactory).toHaveBeenCalledWith(
        "openpanel",
      );
      expect(mockResetOpenPanelClient).toHaveBeenCalled();
    });
  });
});
