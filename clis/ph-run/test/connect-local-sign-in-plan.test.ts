import {
  checkSignInCode,
  LOCAL_SIGN_IN_PARAM,
  LOCAL_SIGN_IN_SECRET_ENV,
  type LocalSignInIssuer,
} from "@powerhousedao/shared/clis/local-sign-in";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  announceSignIn,
  connectHandle,
  localSignInPlan,
  type ConnectHostParsed,
  type LocalSignInIssuerFactory,
} from "../src/runners/connect.js";

const hostWith = (localSignIn?: unknown) =>
  ({
    name: "connect",
    runner: localSignIn === undefined ? {} : { localSignIn },
  }) as unknown as ConnectHostParsed;

const ctxWith = (env: Record<string, string | undefined> = {}) =>
  ({
    projectRoot: "/project",
    verb: "dev",
    env: { PH_USER_DATA_DIR: "/data", ...env },
  }) as never;

const asked: Parameters<LocalSignInIssuerFactory>[0][] = [];
const issuers: LocalSignInIssuerFactory = (o) => {
  asked.push(o);
  return Promise.resolve({} as LocalSignInIssuer);
};

afterEach(() => {
  asked.length = 0;
  vi.restoreAllMocks();
});

describe("localSignInPlan", () => {
  it("is on at dev and off at serve, unless the host says otherwise", () => {
    expect(
      localSignInPlan(hostWith(), ctxWith(), { byDefault: true, issuers }),
    ).toBeDefined();
    expect(
      localSignInPlan(hostWith(false), ctxWith(), { byDefault: true, issuers }),
    ).toBeUndefined();
    expect(
      localSignInPlan(hostWith(), ctxWith(), { byDefault: false, issuers }),
    ).toBeUndefined();
    expect(
      localSignInPlan(hostWith(true), ctxWith(), { byDefault: false, issuers }),
    ).toBeDefined();
  });

  it("needs an issuer, and says so only where the host asked for it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      localSignInPlan(hostWith(), ctxWith(), {
        byDefault: true,
        issuers: undefined,
      }),
    ).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
    expect(
      localSignInPlan(hostWith(true), ctxWith(), {
        byDefault: false,
        issuers: undefined,
      }),
    ).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("announces a secret it made, and leaves a handed one to whoever handed it", async () => {
    const own = localSignInPlan(hostWith(), ctxWith(), {
      byDefault: true,
      issuers,
    });
    expect(own?.announce).toBe(true);
    const handed = localSignInPlan(
      hostWith({ sessions: ["vetra agent vetra-agent"] }),
      ctxWith({ [LOCAL_SIGN_IN_SECRET_ENV]: "c2VjcmV0" }),
      { byDefault: false, open: false, issuers },
    );
    expect(handed).toMatchObject({
      secret: "c2VjcmV0",
      announce: false,
      open: false,
    });
    await handed!.endpoint.issuer();
    expect(asked).toMatchObject([
      { dataDir: "/data", sessions: ["vetra agent vetra-agent"] },
    ]);
  });
});

describe("a Connect that signs in by link", () => {
  it("reports it in its outputs, never its secret", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const plan = localSignInPlan(
      hostWith(),
      ctxWith({ [LOCAL_SIGN_IN_SECRET_ENV]: "c2VjcmV0" }),
      { byDefault: true, issuers },
    )!;
    const handle = connectHandle(
      {
        resolvedUrls: { local: ["http://localhost:3000/"] },
        close: () => Promise.resolve(),
      },
      { host: "localhost", port: 3000 },
      plan,
    );
    expect(handle.outputs).toEqual({
      origin: "http://localhost:3000",
      endpoints: { connect: "http://localhost:3000/" },
      localSignIn: {},
    });
    expect(JSON.stringify(handle.outputs)).not.toContain("c2VjcmV0");
    // Handed the secret: the compound announces the link.
    expect(log).not.toHaveBeenCalled();
  });

  it("prints a link with a fresh code, and opens it only as asked", () => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => {
      lines.push(line);
    });
    const opened: string[] = [];
    const secret = "c2VjcmV0LWZvci10aGUtdGVzdA";
    announceSignIn("http://localhost:3000/", { secret }, (url) =>
      opened.push(url),
    );
    expect(opened).toEqual([]);
    announceSignIn("http://localhost:3000/", { secret, open: true }, (url) =>
      opened.push(url),
    );
    expect(opened).toHaveLength(1);
    const link = new URL(opened[0]!);
    const code = new URLSearchParams(link.hash.slice(1)).get(
      LOCAL_SIGN_IN_PARAM,
    )!;
    expect(checkSignInCode(secret, code, link.origin).ok).toBe(true);
    expect(lines[1]).toBe(`  ➜  Sign in: ${opened[0]}`);
  });
});
