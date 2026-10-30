import type { PowerhouseVerifiableCredential } from "@renown/sdk";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "../src/services/auth.service.js";
import {
  assertOwnerClaimBind,
  FileCredentialKeep,
  OwnerClaim,
} from "../src/services/host-auth-state.js";
import { createRenownCredentialVerifier } from "../src/services/renown-credential-verifier.js";

const mockCheck = vi.fn();
const mockProof = vi.fn();
const mockFetch = vi.fn();
const mockVerifyBearer = vi.fn();

vi.mock("@renown/sdk", () => ({
  checkDelegationCredential: (...args: unknown[]) => mockCheck(...args),
  fetchDelegationCredential: (...args: unknown[]) => mockFetch(...args),
  resolveSwitchboardEndpoint: () => Promise.resolve(undefined),
  verifyAuthBearerToken: (...args: unknown[]) => mockVerifyBearer(...args),
  verifyDelegationProof: (...args: unknown[]) => mockProof(...args),
}));

const ADDRESS = "0xAbC0000000000000000000000000000000000001";
const OTHER = "0xdef0000000000000000000000000000000000002";
const APP = "did:key:zApp";
const ASK = { address: ADDRESS, chainId: 1, appId: APP };

const credential = (id = "urn:uuid:one", expirationDate?: string) =>
  ({ id, expirationDate }) as unknown as PowerhouseVerifiableCredential;

describe("host auth state", () => {
  let dir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    dir = await mkdtemp(join(tmpdir(), "host-auth-state-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe("assertOwnerClaimBind", () => {
    it("allows a host only its own machine can reach", () => {
      for (const host of ["127.0.0.1", "::1", "localhost"]) {
        expect(() => assertOwnerClaimBind(host)).not.toThrow();
      }
    });

    it("refuses a host others can reach, which one naming no bind is", () => {
      for (const host of ["0.0.0.0", "::", "192.168.1.20", undefined]) {
        expect(() => assertOwnerClaimBind(host)).toThrow(/loopback/);
      }
    });
  });

  describe("OwnerClaim", () => {
    const file = () => join(dir, "nested", ".owner.json");

    it("makes the first verified caller the admin, in the list everyone reads", () => {
      const admins: string[] = [];
      new OwnerClaim(file(), admins).observe(ADDRESS);
      expect(admins).toEqual([ADDRESS.toLowerCase()]);
    });

    it("keeps a second person out", () => {
      const admins: string[] = [];
      const claim = new OwnerClaim(file(), admins);
      claim.observe(ADDRESS);
      claim.observe(OTHER);
      expect(admins).toEqual([ADDRESS.toLowerCase()]);
    });

    it("survives a restart", async () => {
      new OwnerClaim(file(), []).observe(ADDRESS);
      expect(JSON.parse(await readFile(file(), "utf8"))).toEqual({
        owner: ADDRESS.toLowerCase(),
      });

      const admins: string[] = [];
      const claim = new OwnerClaim(file(), admins);
      expect(admins).toEqual([ADDRESS.toLowerCase()]);
      claim.observe(OTHER);
      expect(admins).toEqual([ADDRESS.toLowerCase()]);
    });

    it("is inert when admins are configured", async () => {
      const admins = [OTHER];
      new OwnerClaim(file(), admins).observe(ADDRESS);
      expect(admins).toEqual([OTHER]);
      await expect(readFile(file(), "utf8")).rejects.toThrow();
    });

    it("does not take a recorded owner over a configured list", () => {
      new OwnerClaim(file(), []).observe(ADDRESS);
      const admins = [OTHER];
      new OwnerClaim(file(), admins);
      expect(admins).toEqual([OTHER]);
    });

    it("refuses to boot on a damaged file rather than be claimed again", async () => {
      await writeFile(join(dir, ".owner.json"), "{ not json");
      expect(() => new OwnerClaim(join(dir, ".owner.json"), [])).toThrow(
        /not valid JSON/,
      );
    });

    it("is told only of callers who verified", async () => {
      const admins: string[] = [];
      const claim = new OwnerClaim(file(), admins);
      const service = new AuthService({
        enabled: true,
        admins,
        verifyCredential: () => Promise.resolve(false),
        onVerified: (user) => claim.observe(user.address),
      });
      mockVerifyBearer.mockResolvedValue({
        verifiableCredential: {
          credentialSubject: {
            address: ADDRESS,
            chainId: 1,
            networkId: "eip155",
          },
        },
        issuer: APP,
      });

      const refused = await service.verifyBearer("Bearer token");
      expect(refused).toBeInstanceOf(Response);
      expect(admins).toEqual([]);
    });

    it("gives the caller who claims the admin list on that same request", async () => {
      const admins: string[] = [];
      const claim = new OwnerClaim(file(), admins);
      const service = new AuthService({
        enabled: true,
        admins,
        verifyCredential: () => Promise.resolve(true),
        onVerified: (user) => claim.observe(user.address),
      });
      mockVerifyBearer.mockResolvedValue({
        verifiableCredential: {
          credentialSubject: {
            address: ADDRESS,
            chainId: 1,
            networkId: "eip155",
          },
        },
        issuer: APP,
      });

      const context = await service.verifyBearer("Bearer token");
      expect(context).toMatchObject({ admins: [ADDRESS.toLowerCase()] });
    });
  });

  describe("FileCredentialKeep", () => {
    const file = () => join(dir, ".credentials.json");

    it("keeps a credential across a restart, by address in any case", () => {
      new FileCredentialKeep(file()).set(ADDRESS, 1, APP, credential());
      const reread = new FileCredentialKeep(file());
      expect(reread.get(ADDRESS.toLowerCase(), 1, APP)?.id).toBe(
        "urn:uuid:one",
      );
      expect(reread.get(ADDRESS, 5, APP)).toBeUndefined();
    });

    it("forgets a credential", () => {
      const keep = new FileCredentialKeep(file());
      keep.set(ADDRESS, 1, APP, credential());
      keep.delete(ADDRESS, 1, APP);
      expect(
        new FileCredentialKeep(file()).get(ADDRESS, 1, APP),
      ).toBeUndefined();
    });
  });

  describe("the keeping verifier", () => {
    const verifier = async () => {
      const keep = new FileCredentialKeep(join(dir, ".credentials.json"));
      const verify = await createRenownCredentialVerifier({ keep });
      return { keep, verify };
    };

    it("keeps what Renown says is active", async () => {
      const { keep, verify } = await verifier();
      mockCheck.mockResolvedValue({
        status: "active",
        credential: credential(),
      });
      expect(await verify(ASK)).toBe(true);
      expect(keep.get(ADDRESS, 1, APP)?.id).toBe("urn:uuid:one");
    });

    it("goes on verifying with Renown unreachable", async () => {
      const { keep, verify } = await verifier();
      keep.set(ADDRESS, 1, APP, credential());
      mockCheck.mockResolvedValue({ status: "unknown" });
      mockProof.mockResolvedValue(true);
      expect(await verify(ASK)).toBe(true);
    });

    it("goes on verifying a credential that expired meanwhile", async () => {
      const { keep, verify } = await verifier();
      const past = new Date(Date.now() - 86_400_000).toISOString();
      keep.set(ADDRESS, 1, APP, credential("urn:uuid:old", past));
      mockCheck.mockResolvedValue({ status: "expired" });
      mockProof.mockResolvedValue(true);
      expect(await verify(ASK)).toBe(true);
      expect(mockCheck.mock.calls[0][0]).toMatchObject({
        expirationDate: past,
      });
    });

    it("refuses a stranger while Renown is unreachable", async () => {
      const { verify } = await verifier();
      mockCheck.mockResolvedValue({ status: "unknown" });
      expect(await verify(ASK)).toBe(false);
    });

    it("refuses a kept credential whose proof does not verify", async () => {
      const { keep, verify } = await verifier();
      keep.set(ADDRESS, 1, APP, credential());
      mockCheck.mockResolvedValue({ status: "unknown" });
      mockProof.mockResolvedValue(false);
      expect(await verify(ASK)).toBe(false);
    });

    it("drops a credential Renown says is revoked", async () => {
      const { keep, verify } = await verifier();
      keep.set(ADDRESS, 1, APP, credential());
      mockCheck.mockResolvedValue({ status: "revoked" });
      expect(await verify(ASK)).toBe(false);
      expect(keep.get(ADDRESS, 1, APP)).toBeUndefined();
    });

    it("leaves a host without a keep refusing during an outage", async () => {
      const verify = await createRenownCredentialVerifier();
      mockFetch.mockResolvedValue(undefined);
      expect(await verify(ASK)).toBe(false);
      expect(mockCheck).not.toHaveBeenCalled();
    });
  });
});
