/**
 * ACCESS=licensed: AuthService admits admins and whoever Vetra's gate allows.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessGate, AccessVerdict } from "../src/services/access-gate.js";
import { AuthService } from "../src/services/auth.service.js";

const mockVerifyAuthBearerToken = vi.fn();

vi.mock("@renown/sdk", () => ({
  verifyAuthBearerToken: (...args: unknown[]) =>
    mockVerifyAuthBearerToken(...args),
}));

const ADMIN = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const HOLDER = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const STRANGER = "0xcccccccccccccccccccccccccccccccccccccccc";

function makeVerified(address: string) {
  return {
    verifiableCredential: {
      credentialSubject: { address, chainId: 1, networkId: "eip155" },
    },
    issuer: "did:key:app",
  };
}

function fakeGate(allowed: Set<string>) {
  const check = vi.fn((address: string): Promise<AccessVerdict> =>
    Promise.resolve({
      allowed: allowed.has(address),
      source: "gate",
    }),
  );
  return { check } satisfies AccessGate;
}

function service(gate: AccessGate) {
  return new AuthService({
    enabled: true,
    admins: [ADMIN],
    skipCredentialVerification: false,
    verifyCredential: () => Promise.resolve(true),
    credentialVerificationCacheTtlMs: 0,
    accessGate: gate,
  });
}

/** The bearer's token is opaque here; the mock decides who it verifies as. */
function bearerFor(address: string): string {
  mockVerifyAuthBearerToken.mockResolvedValue(makeVerified(address));
  return "Bearer token";
}

describe("AuthService with an access gate (ACCESS=licensed)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("verifyBearer", () => {
    it("admits an admin without asking the gate", async () => {
      const gate = fakeGate(new Set());
      const result = await service(gate).verifyBearer(bearerFor(ADMIN));
      expect(result).not.toBeInstanceOf(Response);
      expect((result as { user?: { address: string } }).user?.address).toBe(
        ADMIN,
      );
      expect(gate.check).not.toHaveBeenCalled();
    });

    it("compares admins case-insensitively and asks the gate in lower case", async () => {
      const gate = fakeGate(new Set([HOLDER]));
      const auth = service(gate);
      expect(
        await auth.verifyBearer(
          bearerFor(ADMIN.toUpperCase().replace("0X", "0x")),
        ),
      ).not.toBeInstanceOf(Response);
      expect(gate.check).not.toHaveBeenCalled();

      const result = await auth.verifyBearer(
        bearerFor(HOLDER.toUpperCase().replace("0X", "0x")),
      );
      expect(result).not.toBeInstanceOf(Response);
      expect(gate.check).toHaveBeenCalledWith(HOLDER);
    });

    it("admits a licence holder", async () => {
      const gate = fakeGate(new Set([HOLDER]));
      const result = await service(gate).verifyBearer(bearerFor(HOLDER));
      expect(result).not.toBeInstanceOf(Response);
      expect((result as { user?: { address: string } }).user?.address).toBe(
        HOLDER,
      );
    });

    it("answers a stranger with a 403", async () => {
      const gate = fakeGate(new Set([HOLDER]));
      const onVerified = vi.fn();
      const auth = new AuthService({
        enabled: true,
        admins: [ADMIN],
        verifyCredential: () => Promise.resolve(true),
        accessGate: gate,
        onVerified,
      });
      const result = await auth.verifyBearer(bearerFor(STRANGER));
      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(403);
      expect(await (result as Response).json()).toEqual({
        error: "No licence for this app",
      });
      expect(onVerified).not.toHaveBeenCalled();
    });

    it("still answers 401 for a credential that no longer holds, before the gate", async () => {
      const gate = fakeGate(new Set([HOLDER]));
      const auth = new AuthService({
        enabled: true,
        admins: [ADMIN],
        verifyCredential: () => Promise.resolve(false),
        credentialVerificationCacheTtlMs: 0,
        accessGate: gate,
      });
      const result = await auth.verifyBearer(bearerFor(HOLDER));
      expect((result as Response).status).toBe(401);
      expect(gate.check).not.toHaveBeenCalled();
    });

    it("leaves a request without a bearer anonymous (the require-auth floor refuses it)", async () => {
      const gate = fakeGate(new Set());
      const result = await service(gate).verifyBearer(undefined);
      expect(result).toEqual({
        user: undefined,
        admins: [ADMIN],
        auth_enabled: true,
      });
      expect(gate.check).not.toHaveBeenCalled();
    });
  });

  describe("authenticateWebSocketConnection", () => {
    it("admits a holder", async () => {
      const gate = fakeGate(new Set([HOLDER]));
      const user = await service(gate).authenticateWebSocketConnection({
        authorization: bearerFor(HOLDER),
      });
      expect(user?.address).toBe(HOLDER);
    });

    it("refuses a stranger", async () => {
      const gate = fakeGate(new Set([HOLDER]));
      await expect(
        service(gate).authenticateWebSocketConnection({
          authorization: bearerFor(STRANGER),
        }),
      ).rejects.toThrow("No licence for this app");
    });
  });

  describe("isCredentialValid", () => {
    const user = (address: string) => ({
      address,
      chainId: 1,
      networkId: "eip155",
      appKey: "did:key:app",
    });

    it("turns false once the gate stops allowing the caller", async () => {
      const allowed = new Set([HOLDER]);
      const auth = service(fakeGate(allowed));
      expect(await auth.isCredentialValid(user(HOLDER))).toBe(true);
      allowed.delete(HOLDER);
      expect(await auth.isCredentialValid(user(HOLDER))).toBe(false);
    });

    it("stays true for an admin", async () => {
      const auth = service(fakeGate(new Set()));
      expect(await auth.isCredentialValid(user(ADMIN))).toBe(true);
    });
  });

  it("admits everyone verified when no gate is configured", async () => {
    const auth = new AuthService({
      enabled: true,
      admins: [ADMIN],
      verifyCredential: () => Promise.resolve(true),
    });
    expect(await auth.verifyBearer(bearerFor(STRANGER))).not.toBeInstanceOf(
      Response,
    );
  });
});
