import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRenownVerifier,
  renownApiJwtMiddleware,
  type JwtMiddlewareHelpers,
} from "../src/auth/renown-verifier.js";

const mockVerifyAuthCredential = vi.fn();
vi.mock("@renown/sdk", () => ({
  verifyAuthCredential: (...args: unknown[]): unknown =>
    mockVerifyAuthCredential(...args) as unknown,
}));

const DID = "did:pkh:eip155:1:0xabc";

describe("createRenownVerifier", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the owner DID when the credential verifies", async () => {
    mockVerifyAuthCredential.mockResolvedValue({ did: DID });
    const verify = createRenownVerifier({ publicUrl: "https://reg.test" });
    expect(await verify("t")).toBe(DID);
  });

  it("returns undefined when verification fails", async () => {
    mockVerifyAuthCredential.mockResolvedValue(undefined);
    const verify = createRenownVerifier({ publicUrl: "https://reg.test" });
    expect(await verify("t")).toBeUndefined();
  });

  it("caches the result per token", async () => {
    mockVerifyAuthCredential.mockResolvedValue({ did: DID });
    const verify = createRenownVerifier({ publicUrl: "https://reg.test" });
    await verify("t");
    await verify("t");
    expect(mockVerifyAuthCredential).toHaveBeenCalledTimes(1);
  });

  it("does not cache when ttl is 0", async () => {
    mockVerifyAuthCredential.mockResolvedValue({ did: DID });
    const verify = createRenownVerifier({
      publicUrl: "https://reg.test",
      cacheTtlMs: 0,
    });
    await verify("t");
    await verify("t");
    expect(mockVerifyAuthCredential).toHaveBeenCalledTimes(2);
  });
});

describe("renownApiJwtMiddleware", () => {
  const helpers: JwtMiddlewareHelpers = {
    createRemoteUser: (name, groups) => ({ name, groups, real_groups: groups }),
    createAnonymousRemoteUser: () => ({
      name: undefined,
      groups: [],
      real_groups: [],
    }),
  };

  function fakeReqRes(authorization?: string) {
    const req = {
      headers: { authorization },
      pause: vi.fn(),
      resume: vi.fn(),
      remote_user: undefined as unknown,
    };
    const res = { locals: {} as Record<string, unknown> };
    return { req, res };
  }

  function run(
    verify: (t: string) => Promise<string | undefined>,
    auth?: string,
  ) {
    const { req, res } = fakeReqRes(auth);
    const mw = renownApiJwtMiddleware(verify, helpers);
    return new Promise<typeof req>((resolve) => {
      mw(req, res, () => resolve(req));
    });
  }

  it("sets remote_user to the owner DID for a valid token", async () => {
    const req = await run(() => Promise.resolve(DID), "Bearer good");
    expect((req.remote_user as { name?: string }).name).toBe(DID);
    expect(req.pause).toHaveBeenCalled();
    expect(req.resume).toHaveBeenCalled();
  });

  it("stays anonymous when there is no bearer token", async () => {
    const verify = vi.fn();
    const req = await run(verify, undefined);
    expect((req.remote_user as { name?: string }).name).toBeUndefined();
    expect(verify).not.toHaveBeenCalled();
  });

  it("stays anonymous when the token does not verify", async () => {
    const req = await run(() => Promise.resolve(undefined), "Bearer bad");
    expect((req.remote_user as { name?: string }).name).toBeUndefined();
  });
});
