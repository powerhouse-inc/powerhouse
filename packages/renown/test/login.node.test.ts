import { describe, expect, it, vi } from "vitest";
import {
  formatExpiry,
  generateAccessToken,
  getAuthStatus,
  parseExpiry,
} from "../src/login.node.js";
import type { IRenown } from "../src/types.js";

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
    expect(formatExpiry(1)).toBe("1 seconds");
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
        credential: {
          issuanceDate: "2025-01-01T00:00:00Z",
        } as IRenown["user"] extends infer U
          ? U extends { credential: infer C }
            ? NonNullable<C>
            : never
          : never,
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
        credential: {
          issuanceDate: "2025-01-01T00:00:00Z",
        } as IRenown["user"] extends infer U
          ? U extends { credential: infer C }
            ? NonNullable<C>
            : never
          : never,
      },
      getBearerToken,
    });

    const result = await generateAccessToken(renown, {
      expiresIn: 3600,
      aud: "https://api.example.com",
      refresh: true,
    });

    expect(result.token).toBe("jwt-token-123");
    expect(result.did).toBe("did:key:test123");
    expect(result.address).toBe("0xabc");
    expect(result.expiresIn).toBe(3600);
    expect(getBearerToken).toHaveBeenCalledWith(
      { expiresIn: 3600, aud: "https://api.example.com" },
      true,
    );
  });
});
