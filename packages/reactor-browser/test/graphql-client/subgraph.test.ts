import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-tag";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GraphQLReactorClient } from "../../src/graphql-client/graphql-reactor-client.js";
import {
  describeGraphQLDocument,
  SubgraphSdkRegistry,
  subgraphUrlFromGraphqlUrl,
  type SubgraphSdkFactory,
} from "../../src/graphql-client/subgraph.js";
import type { SdkFunctionWrapper } from "../../src/graphql/gen/schema.js";
import type { ReactorGraphQLClient } from "../../src/graphql/types.js";

const url = "http://switchboard.test/graphql";

/** The captured wire calls of a stubbed `fetch`. */
type FetchCall = { url: string; init: RequestInit };

/** Replaces `fetch` with a spy answering every GraphQL request from `data`. */
function stubFetch(data: unknown) {
  const calls: FetchCall[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    return Promise.resolve(
      new Response(JSON.stringify({ data }), {
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

/** What a generated `getSdk` receives, captured for assertions. */
type CapturedSdk = {
  transport: GraphQLClient;
  wrapper: SdkFunctionWrapper | undefined;
  Ping: () => Promise<unknown>;
};

const unwrapped: SdkFunctionWrapper = (action) => action();

function makeCapturingFactory(): SubgraphSdkFactory<CapturedSdk> {
  return (transport, wrapper) => ({
    transport,
    wrapper,
    Ping: () =>
      (wrapper ?? unwrapped)(
        (requestHeaders) =>
          transport.request<unknown>({
            document: gql`
              query Ping {
                __typename
              }
            `,
            requestHeaders,
          }),
        "Ping",
        "query",
      ),
  });
}

beforeEach(() => {
  window.ph = {};
});

afterEach(() => {
  window.ph = {};
  vi.restoreAllMocks();
});

describe("subgraphUrlFromGraphqlUrl", () => {
  it("serves a subgraph next to the supergraph", () => {
    expect(subgraphUrlFromGraphqlUrl(url, "statements")).toBe(
      "http://switchboard.test/graphql/statements",
    );
  });

  it("does not double the separator on a trailing slash", () => {
    expect(subgraphUrlFromGraphqlUrl("http://host/graphql/", "todo")).toBe(
      "http://host/graphql/todo",
    );
  });

  it("rejects an empty name", () => {
    expect(() => subgraphUrlFromGraphqlUrl(url, "  ")).toThrow(
      "a subgraph name is required",
    );
  });
});

describe("describeGraphQLDocument", () => {
  it("reads the name and type off a document", () => {
    expect(
      describeGraphQLDocument(gql`
        query RenownUsers {
          __typename
        }
      `),
    ).toEqual({ operationName: "RenownUsers", operationType: "query" });
  });

  it("reads a mutation off a document", () => {
    expect(
      describeGraphQLDocument(gql`
        mutation Revoke($id: String!) {
          revoke(id: $id)
        }
      `),
    ).toEqual({ operationName: "Revoke", operationType: "mutation" });
  });

  it("falls back for an anonymous document", () => {
    expect(
      describeGraphQLDocument(gql`
        {
          __typename
        }
      `),
    ).toEqual({ operationName: "AnonymousOperation", operationType: "query" });
  });

  it("reads the name and type off a source string", () => {
    expect(describeGraphQLDocument("mutation Revoke { revoke }")).toEqual({
      operationName: "Revoke",
      operationType: "mutation",
    });
  });

  it("falls back for an unnamed source string", () => {
    expect(describeGraphQLDocument("{ __typename }")).toEqual({
      operationName: "AnonymousOperation",
      operationType: "query",
    });
  });
});

describe("SubgraphSdkRegistry", () => {
  it("hands the factory a transport bound to the subgraph and the auth middleware", async () => {
    const calls = stubFetch({ __typename: "Query" });
    const middleware: SdkFunctionWrapper = (action) =>
      action({ authorization: "Bearer token-1" });
    const registry = new SubgraphSdkRegistry(url, middleware);

    const sdk = registry.get("statements", makeCapturingFactory());
    await sdk.Ping();

    expect(sdk.wrapper).toBe(middleware);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://switchboard.test/graphql/statements");
    expect(authorizationOf(calls[0].init)).toBe("Bearer token-1");
  });

  it("builds the sdk once per name", () => {
    const registry = new SubgraphSdkRegistry(url);
    const factory = vi.fn(makeCapturingFactory());

    const first = registry.get("statements", factory);
    const second = registry.get("statements", factory);

    expect(second).toBe(first);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("gives each subgraph its own transport", () => {
    const registry = new SubgraphSdkRegistry(url);
    const factory = makeCapturingFactory();

    const statements = registry.get("statements", factory);
    const todo = registry.get("todo", factory);

    expect(todo.transport).not.toBe(statements.transport);
  });

  it("reuses the transport when a second sdk is bound to the same subgraph", () => {
    const registry = new SubgraphSdkRegistry(url);

    const first = registry.get("statements", makeCapturingFactory());
    const second = registry.get("statements", makeCapturingFactory());

    expect(second).not.toBe(first);
    expect(second.transport).toBe(first.transport);
  });

  it("reports a subgraph endpoint", () => {
    expect(new SubgraphSdkRegistry(url).urlFor("todo")).toBe(
      "http://switchboard.test/graphql/todo",
    );
  });
});

describe("GraphQLReactorClient.subgraph", () => {
  it("reaches the subgraph through the client's own url and auth", async () => {
    const calls = stubFetch({ __typename: "Query" });
    const client = new GraphQLReactorClient({
      url,
      realtime: false,
      tokenProvider: () => Promise.resolve("token-1"),
    });

    await client.subgraph("statements", makeCapturingFactory()).Ping();

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://switchboard.test/graphql/statements");
    expect(authorizationOf(calls[0].init)).toBe("Bearer token-1");
  });

  it("returns the same sdk on every call", () => {
    const client = new GraphQLReactorClient({ url, realtime: false });
    const factory = makeCapturingFactory();

    expect(client.subgraph("statements", factory)).toBe(
      client.subgraph("statements", factory),
    );
  });

  it("authenticates a subgraph even when the reactor sdk was injected", async () => {
    const calls = stubFetch({ __typename: "Query" });
    const client = new GraphQLReactorClient({
      url,
      realtime: false,
      tokenProvider: () => Promise.resolve("token-1"),
      graphqlClient: {} as unknown as ReactorGraphQLClient,
    });

    await client.subgraph("statements", makeCapturingFactory()).Ping();

    expect(authorizationOf(calls[0].init)).toBe("Bearer token-1");
  });
});

describe("GraphQLReactorClient.request", () => {
  it("runs a document against the client's own endpoint, authenticated", async () => {
    const calls = stubFetch({ __typename: "Query" });
    const client = new GraphQLReactorClient({
      url,
      realtime: false,
      tokenProvider: () => Promise.resolve("token-1"),
    });

    const result = await client.request<{ __typename: string }>(gql`
      query Ping {
        __typename
      }
    `);

    expect(result).toEqual({ __typename: "Query" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(url);
    expect(authorizationOf(calls[0].init)).toBe("Bearer token-1");
  });

  it("passes variables through", async () => {
    const calls = stubFetch({ renownUsers: [] });
    const client = new GraphQLReactorClient({ url, realtime: false });

    await client.request(
      gql`
        query RenownUsers($drive: String!) {
          renownUsers(input: { driveId: $drive }) {
            documentId
          }
        }
      `,
      { drive: "drive-1" },
    );

    const body = JSON.parse(String(calls[0].init.body)) as {
      variables: unknown;
    };
    expect(body.variables).toEqual({ drive: "drive-1" });
  });

  it("reports the document's operation to the middleware", async () => {
    const RunDocument = vi.fn().mockResolvedValue({ __typename: "Query" });
    const client = new GraphQLReactorClient({
      url,
      realtime: false,
      graphqlClient: { RunDocument } as unknown as ReactorGraphQLClient,
    });

    await client.request(gql`
      query Ping {
        __typename
      }
    `);

    expect(RunDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: "Ping",
        operationType: "query",
      }),
    );
  });

  it("lets the caller name the operation", async () => {
    const RunDocument = vi.fn().mockResolvedValue({ __typename: "Query" });
    const client = new GraphQLReactorClient({
      url,
      realtime: false,
      graphqlClient: { RunDocument } as unknown as ReactorGraphQLClient,
    });

    await client.request("{ __typename }", undefined, {
      operationName: "Ping",
    });

    expect(RunDocument).toHaveBeenCalledWith(
      expect.objectContaining({ operationName: "Ping" }),
    );
  });
});
