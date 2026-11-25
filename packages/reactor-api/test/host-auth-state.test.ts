import { fileAccessList } from "@powerhousedao/shared/clis/owner-only";
import { statSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "../src/services/auth.service.js";
import {
  assertOwnerClaimBind,
  OwnerClaim,
} from "../src/services/host-auth-state.js";

const mockVerifyBearer = vi.fn();

vi.mock("@renown/sdk", () => ({
  verifyAuthBearerToken: (...args: unknown[]) => mockVerifyBearer(...args),
  carriedCredentialOf: () => undefined,
}));

const ADDRESS = "0xAbC0000000000000000000000000000000000001";
const OTHER = "0xdef0000000000000000000000000000000000002";
const APP = "did:key:zApp";

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

    it("is readable by the OS user only", () => {
      new OwnerClaim(file(), []).observe(ADDRESS);
      if (process.platform === "win32") {
        expect(fileAccessList(file())).toHaveLength(1);
      } else {
        expect(statSync(file()).mode & 0o777).toBe(0o600);
      }
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
});
