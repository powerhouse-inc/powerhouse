import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IRenown } from "../src/types.js";

let openBrowserShouldFail = false;

vi.mock("node:child_process", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return {
    ...actual,
    execFile: (...args: unknown[]) => {
      if (openBrowserShouldFail) {
        const cb = args[args.length - 1];
        if (typeof cb === "function") {
          (cb as (err: Error) => void)(new Error("spawn ENOENT"));
        }
        return {};
      }
      return (actual.execFile as (...a: unknown[]) => unknown)(...args);
    },
  };
});

const {
  browserLogin,
  formatExpiry,
  generateAccessToken,
  getAuthStatus,
  parseExpiry,
} = await import("../src/login.node.js");

describe("parseExpiry", () => {
  it("parses days", () => {
    expect(parseExpiry("7d")).toBe(7 * 86400);
    expect(parseExpiry("1d")).toBe(86400);
    expect(parseExpiry("30d")).toBe(30 * 86400);
  });

  it("parses hours", () => {
    expect(parseExpiry("24h")).toBe(24 * 3600);
    expect(parseExpiry("1h")).toBe(3600);
  });

  it("parses seconds with suffix", () => {
    expect(parseExpiry("3600s")).toBe(3600);
    expect(parseExpiry("60s")).toBe(60);
  });

  it("parses bare seconds", () => {
    expect(parseExpiry("3600")).toBe(3600);
    expect(parseExpiry("120")).toBe(120);
  });

  it("trims whitespace", () => {
    expect(parseExpiry("  7d  ")).toBe(7 * 86400);
  });

  it("is case-insensitive", () => {
    expect(parseExpiry("7D")).toBe(7 * 86400);
    expect(parseExpiry("24H")).toBe(24 * 3600);
    expect(parseExpiry("60S")).toBe(60);
  });

  it("rejects decimals", () => {
    expect(() => parseExpiry("1.5h")).toThrow("Invalid expiry format");
    expect(() => parseExpiry("2.5d")).toThrow("Invalid expiry format");
    expect(() => parseExpiry("10.0")).toThrow("Invalid expiry format");
  });

  it("rejects zero", () => {
    expect(() => parseExpiry("0d")).toThrow("Value must be a positive integer");
    expect(() => parseExpiry("0")).toThrow("Value must be a positive integer");
  });

  it("rejects negative values", () => {
    expect(() => parseExpiry("-1d")).toThrow("Invalid expiry format");
  });

  it("rejects empty and garbage input", () => {
    expect(() => parseExpiry("")).toThrow("Invalid expiry format");
    expect(() => parseExpiry("abc")).toThrow("Invalid expiry format");
    expect(() => parseExpiry("d")).toThrow("Invalid expiry format");
    expect(() => parseExpiry("h")).toThrow("Invalid expiry format");
  });

  it("rejects unknown suffixes", () => {
    expect(() => parseExpiry("7m")).toThrow("Invalid expiry format");
    expect(() => parseExpiry("7w")).toThrow("Invalid expiry format");
  });
});

describe("formatExpiry", () => {
  it("formats days", () => {
    expect(formatExpiry(86400)).toBe("1 day");
    expect(formatExpiry(7 * 86400)).toBe("7 days");
  });

  it("formats days and hours", () => {
    expect(formatExpiry(86400 + 3600)).toBe("1 day and 1 hour");
    expect(formatExpiry(2 * 86400 + 5 * 3600)).toBe("2 days and 5 hours");
  });

  it("formats hours", () => {
    expect(formatExpiry(3600)).toBe("1 hour");
    expect(formatExpiry(12 * 3600)).toBe("12 hours");
  });

  it("formats seconds", () => {
    expect(formatExpiry(120)).toBe("120 seconds");
    expect(formatExpiry(1)).toBe("1 second");
  });
});

function mockRenown(overrides: Partial<IRenown> = {}): IRenown {
  return {
    baseUrl: "https://www.renown.id",
    user: undefined,
    status: "initial",
    login: vi.fn(),
    logout: vi.fn(),
    crypto: {} as IRenown["crypto"],
    signer: {} as IRenown["signer"],
    did: "did:key:test123",
    profileFetcher: undefined,
    verifyBearerToken: vi.fn(),
    getBearerToken: vi.fn().mockResolvedValue("mock-token"),
    on: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  };
}

function mockCredential() {
  return {
    issuanceDate: "2025-01-01T00:00:00Z",
  } as IRenown["user"] extends infer U
    ? U extends { credential: infer C }
      ? NonNullable<C>
      : never
    : never;
}

describe("getAuthStatus", () => {
  it("returns not authenticated when no user", () => {
    const renown = mockRenown();
    const status = getAuthStatus(renown);
    expect(status.authenticated).toBe(false);
    expect(status.address).toBeUndefined();
    expect(status.cliDid).toBe("did:key:test123");
  });

  it("returns not authenticated when user has no credential", () => {
    const renown = mockRenown({
      user: {
        address: "0x123" as `0x${string}`,
        chainId: 1,
        networkId: "eip155",
        did: "did:pkh:eip155:1:0x123",
        credential: undefined,
      },
    });
    const status = getAuthStatus(renown);
    expect(status.authenticated).toBe(false);
    expect(status.address).toBe("0x123");
  });

  it("returns authenticated with full user info", () => {
    const renown = mockRenown({
      user: {
        address: "0xabc" as `0x${string}`,
        chainId: 1,
        networkId: "eip155",
        did: "did:pkh:eip155:1:0xabc",
        credential: mockCredential(),
      },
    });
    const status = getAuthStatus(renown);
    expect(status.authenticated).toBe(true);
    expect(status.address).toBe("0xabc");
    expect(status.userDid).toBe("did:pkh:eip155:1:0xabc");
    expect(status.chainId).toBe(1);
    expect(status.authenticatedAt).toEqual(new Date("2025-01-01T00:00:00Z"));
  });
});

describe("generateAccessToken", () => {
  it("throws when not authenticated", async () => {
    const renown = mockRenown();
    await expect(generateAccessToken(renown)).rejects.toThrow(
      "Not authenticated",
    );
  });

  it("throws when user has no credential", async () => {
    const renown = mockRenown({
      user: {
        address: "0x123" as `0x${string}`,
        chainId: 1,
        networkId: "eip155",
        did: "did:pkh:eip155:1:0x123",
        credential: undefined,
      },
    });
    await expect(generateAccessToken(renown)).rejects.toThrow(
      "Not authenticated",
    );
  });

  it("generates a token when authenticated", async () => {
    const getBearerToken = vi.fn().mockResolvedValue("jwt-token-123");
    const renown = mockRenown({
      user: {
        address: "0xabc" as `0x${string}`,
        chainId: 1,
        networkId: "eip155",
        did: "did:pkh:eip155:1:0xabc",
        credential: mockCredential(),
      },
      getBearerToken,
    });

    const result = await generateAccessToken(renown, {
      expiresIn: 3600,
      aud: "https://api.example.com",
    });

    expect(result.token).toBe("jwt-token-123");
    expect(result.did).toBe("did:key:test123");
    expect(result.address).toBe("0xabc");
    expect(result.expiresIn).toBe(3600);
    expect(getBearerToken).toHaveBeenCalledWith({
      expiresIn: 3600,
      aud: "https://api.example.com",
    });
  });
});

describe("browserLogin", () => {
  let originalFetch: typeof globalThis.fetch;
  let originalRandomUUID: typeof crypto.randomUUID;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalRandomUUID = crypto.randomUUID.bind(crypto);
    crypto.randomUUID = vi.fn().mockReturnValue("test-session-id");
    openBrowserShouldFail = true;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    crypto.randomUUID = originalRandomUUID;
    openBrowserShouldFail = false;
  });

  it("throws when already authenticated", async () => {
    const renown = mockRenown({
      user: {
        address: "0xabc" as `0x${string}`,
        chainId: 1,
        networkId: "eip155",
        did: "did:pkh:eip155:1:0xabc",
        credential: mockCredential(),
      },
    });

    await expect(
      browserLogin(renown, { renownUrl: "https://renown.test" }),
    ).rejects.toThrow("Already authenticated");
  });

  it("calls onLoginUrl with the constructed URL", async () => {
    const onLoginUrl = vi.fn();
    const login = vi.fn().mockResolvedValue({
      address: "0xabc" as `0x${string}`,
      chainId: 1,
      networkId: "eip155",
      did: "did:pkh:eip155:1:0xabc",
      credential: mockCredential(),
    });
    const renown = mockRenown({ login });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          sessionId: "test-session-id",
          status: "ready",
          did: "did:pkh:eip155:1:0xabc",
          address: "0xabc",
          chainId: 1,
          credentialId: "cred-1",
          userDocumentId: "doc-1",
        }),
    });

    await browserLogin(renown, {
      renownUrl: "https://renown.test",
      onLoginUrl,
    });

    expect(onLoginUrl).toHaveBeenCalledWith(
      expect.stringContaining("https://renown.test/console"),
      "test-session-id",
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const url = new URL(onLoginUrl.mock.calls[0][0]);
    expect(url.searchParams.get("session")).toBe("test-session-id");
    expect(url.searchParams.get("connect")).toBe("did:key:test123");
    expect(url.searchParams.get("app")).toBe("did:key:test123");
  });

  it("polls until session is ready", async () => {
    const login = vi.fn().mockResolvedValue({
      address: "0xabc" as `0x${string}`,
      chainId: 1,
      networkId: "eip155",
      did: "did:pkh:eip155:1:0xabc",
      credential: mockCredential(),
    });
    const onPollTick = vi.fn();
    const renown = mockRenown({ login });

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount < 3) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              sessionId: "test-session-id",
              status: "pending",
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            sessionId: "test-session-id",
            status: "ready",
            did: "did:pkh:eip155:1:0xabc",
            address: "0xabc",
            chainId: 1,
            credentialId: "cred-1",
            userDocumentId: "doc-1",
          }),
      });
    });

    const result = await browserLogin(renown, {
      renownUrl: "https://renown.test",
      onPollTick,
    });

    expect(result.user.address).toBe("0xabc");
    expect(result.cliDid).toBe("did:key:test123");
    expect(login).toHaveBeenCalledWith("did:pkh:eip155:1:0xabc");
    expect(onPollTick).toHaveBeenCalled();
  });

  it("throws on timeout", async () => {
    const renown = mockRenown();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ sessionId: "test-session-id", status: "pending" }),
    });

    await expect(
      browserLogin(renown, {
        renownUrl: "https://renown.test",
        timeoutMs: 100,
      }),
    ).rejects.toThrow("Authentication timed out");
  });

  it("retries on network errors", async () => {
    const login = vi.fn().mockResolvedValue({
      address: "0xabc" as `0x${string}`,
      chainId: 1,
      networkId: "eip155",
      did: "did:pkh:eip155:1:0xabc",
      credential: mockCredential(),
    });
    const renown = mockRenown({ login });

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error("Network error"));
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            sessionId: "test-session-id",
            status: "ready",
            did: "did:pkh:eip155:1:0xabc",
            address: "0xabc",
            chainId: 1,
            credentialId: "cred-1",
            userDocumentId: "doc-1",
          }),
      });
    });

    const result = await browserLogin(renown, {
      renownUrl: "https://renown.test",
    });

    expect(result.user.address).toBe("0xabc");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("aborts when signal is triggered", async () => {
    const renown = mockRenown();
    const controller = new AbortController();

    globalThis.fetch = vi.fn().mockImplementation(() => {
      controller.abort();
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ sessionId: "test-session-id", status: "pending" }),
      });
    });

    await expect(
      browserLogin(renown, {
        renownUrl: "https://renown.test",
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });

  it("calls onBrowserOpenFailed when browser open fails", async () => {
    const onBrowserOpenFailed = vi.fn();
    const login = vi.fn().mockResolvedValue({
      address: "0xabc" as `0x${string}`,
      chainId: 1,
      networkId: "eip155",
      did: "did:pkh:eip155:1:0xabc",
      credential: mockCredential(),
    });
    const renown = mockRenown({ login });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          sessionId: "test-session-id",
          status: "ready",
          did: "did:pkh:eip155:1:0xabc",
          address: "0xabc",
          chainId: 1,
          credentialId: "cred-1",
          userDocumentId: "doc-1",
        }),
    });

    const result = await browserLogin(renown, {
      renownUrl: "https://renown.test",
      onBrowserOpenFailed,
    });

    expect(onBrowserOpenFailed).toHaveBeenCalledWith(
      expect.stringContaining("https://renown.test/console"),
    );
    expect(result.user.address).toBe("0xabc");
  });

  it("normalizes trailing slashes in renownUrl", async () => {
    const login = vi.fn().mockResolvedValue({
      address: "0xabc" as `0x${string}`,
      chainId: 1,
      networkId: "eip155",
      did: "did:pkh:eip155:1:0xabc",
      credential: mockCredential(),
    });
    const onLoginUrl = vi.fn();
    const renown = mockRenown({ login });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          sessionId: "test-session-id",
          status: "ready",
          did: "did:pkh:eip155:1:0xabc",
          address: "0xabc",
          chainId: 1,
          credentialId: "cred-1",
          userDocumentId: "doc-1",
        }),
    });

    await browserLogin(renown, {
      renownUrl: "https://renown.test/",
      onLoginUrl,
    });

    const url = onLoginUrl.mock.calls[0][0] as string;
    expect(url).not.toContain("//console");
    // Session polling URL should also not have double slashes
    const fetchUrl = (
      globalThis.fetch as ReturnType<typeof vi.fn<typeof fetch>>
    ).mock.calls[0][0];
    expect(fetchUrl).not.toContain("//api");
  });
});
