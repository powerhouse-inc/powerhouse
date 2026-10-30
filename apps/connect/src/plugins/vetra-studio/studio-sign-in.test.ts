import { describe, expect, it, vi } from "vitest";
import {
  readStudioSignInRequest,
  signedInLocation,
  signInAsStudio,
  signOutOfStudio,
  type StudioSignInEnv,
} from "./studio-sign-in.js";

const publicKey = { kty: "EC", crv: "P-256", x: "x", y: "y" };
const privateKey = { ...publicKey, d: "d" };
const identity = {
  userDid: "did:pkh:eip155:1:0xabc",
  did: "did:key:zHost",
  address: "0xAbC",
  chainId: 1,
};

function env(response: unknown, status = 200) {
  const calls: string[] = [];
  const fetch = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify(response), {
        status,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
  const value: StudioSignInEnv = {
    fetch: fetch as unknown as typeof globalThis.fetch,
    origin: "http://localhost:2540",
    keyStorage: {
      saveKeyPair: vi.fn((pair) => {
        calls.push(`save:${JSON.stringify(pair)}`);
        return Promise.resolve();
      }),
      removeKeyPair: vi.fn(() => {
        calls.push("remove");
        return Promise.resolve();
      }),
    },
    logout: vi.fn(() => {
      calls.push("logout");
      return Promise.resolve();
    }),
  };
  return { env: value, fetch, calls };
}

describe("readStudioSignInRequest", () => {
  it("reads a sign-in with its bearer, an optional switchboard, and a sign-out", () => {
    expect(readStudioSignInRequest("#studio-sign-in=abc.def")).toEqual({
      kind: "sign-in",
      token: "abc.def",
    });
    expect(
      readStudioSignInRequest(
        "#studio-sign-in=t&switchboard=http%3A%2F%2Fsb%3A4001%2Fgraphql",
      ),
    ).toEqual({
      kind: "sign-in",
      token: "t",
      switchboardUrl: "http://sb:4001/graphql",
    });
    expect(readStudioSignInRequest("#studio-sign-out")).toEqual({
      kind: "sign-out",
    });
    expect(readStudioSignInRequest("")).toBeUndefined();
    expect(readStudioSignInRequest("#studio-sign-in=")).toBeUndefined();
  });
});

describe("signInAsStudio", () => {
  it("asks the page's own /graphql with the bearer, then logs out and installs the key", async () => {
    const {
      env: e,
      fetch,
      calls,
    } = env({
      data: {
        studioSignIn: {
          ...identity,
          keyPair: {
            publicKey: JSON.stringify(publicKey),
            privateKey: JSON.stringify(privateKey),
          },
        },
      },
    });
    const result = await signInAsStudio({ kind: "sign-in", token: "tok" }, e);
    expect(result).toEqual(identity);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://localhost:2540/graphql");
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer tok",
    );
    expect(calls).toEqual([
      "logout",
      `save:${JSON.stringify({ publicKey, privateKey })}`,
    ]);
  });

  it("names the switchboard's refusal and touches nothing", async () => {
    const { env: e, calls } = env({
      data: null,
      errors: [{ message: "Studio sign-in is for the host's admins." }],
    });
    await expect(
      signInAsStudio({ kind: "sign-in", token: "tok" }, e),
    ).rejects.toThrow(
      /refused the sign-in: Studio sign-in is for the host's admins/,
    );
    expect(calls).toEqual([]);
  });

  it("names the status when the response carries no GraphQL body", async () => {
    const { env: e } = env("nope", 401);
    await expect(
      signInAsStudio({ kind: "sign-in", token: "tok" }, e),
    ).rejects.toThrow(/HTTP 401/);
  });
});

describe("signing out and the login location", () => {
  it("logs out and removes the key", async () => {
    const { env: e, calls } = env({});
    await signOutOfStudio(e);
    expect(calls).toEqual(["logout", "remove"]);
  });

  it("keeps the page and its query, adding the user DID", () => {
    expect(
      signedInLocation(
        { pathname: "/d/mail", search: "?x=1" },
        "did:pkh:eip155:1:0xabc",
      ),
    ).toBe("/d/mail?x=1&user=did%3Apkh%3Aeip155%3A1%3A0xabc");
  });
});
