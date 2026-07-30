import type { IRenown } from "@renown/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ambientRenownTokenProvider,
  makeAuthMiddleware,
} from "../../src/graphql-client/auth.js";
import { GraphQLReactorClient } from "../../src/graphql-client/graphql-reactor-client.js";
import type { ReactorGraphQLClient } from "../../src/graphql/types.js";

const url = "http://switchboard.test/graphql";

const documentFields = {
  id: "doc-1",
  slug: "my-doc",
  name: "My Doc",
  documentType: "powerhouse/test",
  state: { global: { name: "hello" }, local: {} },
  createdAtUtcIso: "2026-01-01T00:00:00.000Z",
  lastModifiedAtUtcIso: "2026-01-02T00:00:00.000Z",
  revisionsList: [{ scope: "global", revision: 7 }],
};

/** Installs a renown with a logged-in user whose token is `token`. */
function installRenownUser(token: string) {
  const getBearerToken = vi.fn().mockResolvedValue(token);
  window.ph = {
    renown: {
      user: { address: "0xabc" },
      getBearerToken,
    } as unknown as IRenown,
  };
  return getBearerToken;
}

/**
 * Replaces `fetch` with a spy answering every GraphQL request from `data`, and
 * returns the captured request inits.
 */
function stubFetch(dataFor: (query: string) => unknown) {
  const calls: RequestInit[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
    calls.push(init ?? {});
    const body = JSON.parse(String(init?.body)) as { query: string };
    return Promise.resolve(
      new Response(JSON.stringify({ data: dataFor(body.query) }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });
  return calls;
}

function authorizationOf(init: RequestInit): string | null {
  return new Headers(init.headers).get("authorization");
}

beforeEach(() => {
  window.ph = {};
});

afterEach(() => {
  window.ph = {};
  vi.restoreAllMocks();
});

describe("makeAuthMiddleware", () => {
  it("sends the bearer token as an authorization header", async () => {
    const action = vi.fn().mockResolvedValue("result");
    const middleware = makeAuthMiddleware(() => Promise.resolve("token-1"));

    await middleware(action, "GetDocument", "query", {});

    expect(action).toHaveBeenCalledWith({ authorization: "Bearer token-1" });
  });

  it("returns the action result untouched", async () => {
    const middleware = makeAuthMiddleware(() => Promise.resolve("token-1"));

    const result = await middleware(
      () => Promise.resolve({ document: null }),
      "GetDocument",
    );

    expect(result).toEqual({ document: null });
  });

  it("sends no header when the provider has no token", async () => {
    const action = vi.fn().mockResolvedValue("result");
    const middleware = makeAuthMiddleware(() => Promise.resolve(undefined));

    await middleware(action, "GetDocument", "query", {});

    expect(action).toHaveBeenCalledWith();
  });

  it("treats an empty token as no token", async () => {
    const action = vi.fn().mockResolvedValue("result");
    const middleware = makeAuthMiddleware(() => Promise.resolve(""));

    await middleware(action, "GetDocument", "query", {});

    expect(action).toHaveBeenCalledWith();
  });

  it("resolves the token on every request instead of caching it", async () => {
    const tokens = ["token-1", "token-2"];
    const tokenProvider = vi.fn(() => Promise.resolve(tokens.shift()));
    const action = vi.fn().mockResolvedValue("result");
    const middleware = makeAuthMiddleware(tokenProvider);

    await middleware(action, "GetDocument");
    await middleware(action, "GetDocument");

    expect(tokenProvider).toHaveBeenCalledTimes(2);
    expect(action.mock.calls).toEqual([
      [{ authorization: "Bearer token-1" }],
      [{ authorization: "Bearer token-2" }],
    ]);
  });

  it("propagates a provider failure instead of silently going anonymous", async () => {
    const action = vi.fn().mockResolvedValue("result");
    const middleware = makeAuthMiddleware(() =>
      Promise.reject(new Error("token service down")),
    );

    await expect(middleware(action, "GetDocument")).rejects.toThrow(
      "token service down",
    );
    expect(action).not.toHaveBeenCalled();
  });
});

describe("ambientRenownTokenProvider", () => {
  it("returns no token when renown is absent", async () => {
    await expect(ambientRenownTokenProvider()).resolves.toBeUndefined();
  });

  it("returns no token while renown is still loading", async () => {
    window.ph = { renown: null };

    await expect(ambientRenownTokenProvider()).resolves.toBeUndefined();
  });

  it("returns no token when nobody is logged in", async () => {
    const getBearerToken = vi.fn();
    window.ph = { renown: { getBearerToken } as unknown as IRenown };

    await expect(ambientRenownTokenProvider()).resolves.toBeUndefined();
    expect(getBearerToken).not.toHaveBeenCalled();
  });

  it("requests a short-lived token without an audience claim", async () => {
    const getBearerToken = installRenownUser("token-1");

    await expect(ambientRenownTokenProvider()).resolves.toBe("token-1");
    expect(getBearerToken).toHaveBeenCalledWith({ expiresIn: 600 });
    expect(getBearerToken.mock.calls[0][0]).not.toHaveProperty("aud");
  });
});

describe("GraphQLReactorClient auth wiring", () => {
  it("authenticates a generated SDK call", async () => {
    const calls = stubFetch(() => ({ document: { document: documentFields } }));
    const client = new GraphQLReactorClient({
      url,
      tokenProvider: () => Promise.resolve("token-1"),
    });

    await client.get("doc-1");

    expect(calls).toHaveLength(1);
    expect(authorizationOf(calls[0])).toBe("Bearer token-1");
  });

  it("authenticates the hand-authored mutation", async () => {
    const calls = stubFetch((query) =>
      query.includes("MutateDocumentWithOperations")
        ? { mutateDocument: { ...documentFields, operations: { items: [] } } }
        : { document: { document: documentFields } },
    );
    const client = new GraphQLReactorClient({
      url,
      tokenProvider: () => Promise.resolve("token-1"),
    });

    await client.execute("doc-1", "main", []);

    expect(calls).toHaveLength(2);
    expect(calls.map(authorizationOf)).toEqual([
      "Bearer token-1",
      "Bearer token-1",
    ]);
  });

  it("reads anonymously when there is no token", async () => {
    const calls = stubFetch(() => ({ document: { document: documentFields } }));
    const client = new GraphQLReactorClient({
      url,
      tokenProvider: () => Promise.resolve(undefined),
    });

    await client.get("doc-1");

    expect(authorizationOf(calls[0])).toBeNull();
  });

  it("defaults to the ambient renown token", async () => {
    installRenownUser("ambient-token");
    const calls = stubFetch(() => ({ document: { document: documentFields } }));
    const client = new GraphQLReactorClient({ url });

    await client.get("doc-1");

    expect(authorizationOf(calls[0])).toBe("Bearer ambient-token");
  });

  it("leaves an injected graphql client alone", async () => {
    const tokenProvider = vi.fn(() => Promise.resolve("token-1"));
    const GetDocument = vi
      .fn()
      .mockResolvedValue({ document: { document: documentFields } });
    const client = new GraphQLReactorClient({
      url,
      tokenProvider,
      graphqlClient: { GetDocument } as unknown as ReactorGraphQLClient,
    });

    await client.get("doc-1");

    expect(tokenProvider).not.toHaveBeenCalled();
    expect(GetDocument).toHaveBeenCalledTimes(1);
  });
});
