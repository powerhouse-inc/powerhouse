import { ApolloServer } from "@apollo/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApolloFetchHandler } from "../../src/graphql/gateway/apollo-gateway-adapter.js";
import type { GatewayContextFactory } from "../../src/graphql/gateway/types.js";
import type { Context } from "../../src/graphql/types.js";

// ─── helpers ────────────────────────────────────────────────────────────────

/** A no-op context factory that satisfies GatewayContextFactory<Context>. */
const noopCtx: GatewayContextFactory<Context> = async () => ({
  headers: {},
  db: null,
});

type ApolloHttpResult = Awaited<
  ReturnType<ApolloServer<Context>["executeHTTPGraphQLRequest"]>
>;

/** Build a minimal Apollo HTTP result with overridable fields. */
function makeApolloResult(
  overrides: Partial<ApolloHttpResult> = {},
): ApolloHttpResult {
  return {
    status: 200,
    headers: new Map([
      ["content-type", "application/json"],
    ]) as ApolloHttpResult["headers"],
    body: { kind: "complete", string: '{"data":{"hello":"world"}}' },
    ...overrides,
  };
}

/** A mock ApolloServer that lets us inspect what createApolloFetchHandler passes in. */
function makeMockServer(result: ApolloHttpResult = makeApolloResult()) {
  const executeHTTPGraphQLRequest = vi.fn().mockResolvedValue(result);
  return {
    server: { executeHTTPGraphQLRequest } as unknown as ApolloServer<Context>,
    executeHTTPGraphQLRequest,
  };
}

// ─── createApolloFetchHandler – request conversion ───────────────────────────

describe("createApolloFetchHandler – request conversion", () => {
  it("passes the request method to executeHTTPGraphQLRequest", async () => {
    const { server, executeHTTPGraphQLRequest } = makeMockServer();
    const handler = createApolloFetchHandler(server, noopCtx);

    await handler(
      new Request("http://localhost/graphql", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "{ hello }" }),
      }),
    );

    expect(executeHTTPGraphQLRequest).toHaveBeenCalledOnce();
    const { httpGraphQLRequest } = executeHTTPGraphQLRequest.mock.calls[0][0];
    expect(httpGraphQLRequest.method).toBe("POST");
  });

  it("passes parsed JSON body to executeHTTPGraphQLRequest for POST requests", async () => {
    const { server, executeHTTPGraphQLRequest } = makeMockServer();
    const handler = createApolloFetchHandler(server, noopCtx);

    await handler(
      new Request("http://localhost/graphql", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "{ hello }", variables: { id: 1 } }),
      }),
    );

    const { httpGraphQLRequest } = executeHTTPGraphQLRequest.mock.calls[0][0];
    expect(httpGraphQLRequest.body).toEqual({
      query: "{ hello }",
      variables: { id: 1 },
    });
  });

  it("passes undefined body to executeHTTPGraphQLRequest for GET requests", async () => {
    const { server, executeHTTPGraphQLRequest } = makeMockServer();
    const handler = createApolloFetchHandler(server, noopCtx);

    await handler(
      new Request("http://localhost/graphql?query=%7B%20hello%20%7D"),
    );

    const { httpGraphQLRequest } = executeHTTPGraphQLRequest.mock.calls[0][0];
    expect(httpGraphQLRequest.body).toBeUndefined();
  });

  it("forwards the query string (search) from the URL", async () => {
    const { server, executeHTTPGraphQLRequest } = makeMockServer();
    const handler = createApolloFetchHandler(server, noopCtx);

    await handler(
      new Request("http://localhost/graphql?query=%7B%20hello%20%7D&foo=bar"),
    );

    const { httpGraphQLRequest } = executeHTTPGraphQLRequest.mock.calls[0][0];
    expect(httpGraphQLRequest.search).toBe("?query=%7B%20hello%20%7D&foo=bar");
  });

  it("forwards request headers as a HeaderMap", async () => {
    const { server, executeHTTPGraphQLRequest } = makeMockServer();
    const handler = createApolloFetchHandler(server, noopCtx);

    await handler(
      new Request("http://localhost/graphql", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-custom": "my-value",
          authorization: "Bearer token123",
        },
        body: JSON.stringify({ query: "{ hello }" }),
      }),
    );

    const { httpGraphQLRequest } = executeHTTPGraphQLRequest.mock.calls[0][0];
    expect(httpGraphQLRequest.headers.get("x-custom")).toBe("my-value");
    expect(httpGraphQLRequest.headers.get("authorization")).toBe(
      "Bearer token123",
    );
  });

  it("passes the Fetch Request to the context factory", async () => {
    let capturedRequest: Request | undefined;
    const ctxFactory: GatewayContextFactory<Context> = async (req) => {
      capturedRequest = req;
      return { headers: {}, db: null };
    };

    const { server, executeHTTPGraphQLRequest } = makeMockServer();
    const handler = createApolloFetchHandler(server, ctxFactory);

    await handler(
      new Request("http://localhost/graphql", {
        method: "POST",
        headers: { "content-type": "application/json", "x-token": "abc" },
        body: JSON.stringify({ query: "{ hello }" }),
      }),
    );

    // The context factory is invoked lazily via the context() callback passed
    // to executeHTTPGraphQLRequest — call it now to trigger the factory.
    const [{ context }] = executeHTTPGraphQLRequest.mock.calls[0];
    await context();

    expect(capturedRequest?.headers.get("x-token")).toBe("abc");
  });

  it("does not throw when the body cannot be parsed as JSON", async () => {
    const { server } = makeMockServer();
    const handler = createApolloFetchHandler(server, noopCtx);

    // POST with no body — body parse catches the error and passes undefined
    await expect(
      handler(new Request("http://localhost/graphql", { method: "POST" })),
    ).resolves.toBeInstanceOf(Response);
  });
});

// ─── createApolloFetchHandler – response conversion ──────────────────────────

describe("createApolloFetchHandler – response conversion", () => {
  it("returns the Apollo response status as the Fetch Response status", async () => {
    const { server } = makeMockServer(makeApolloResult({ status: 400 }));
    const handler = createApolloFetchHandler(server, noopCtx);

    const res = await handler(
      new Request("http://localhost/graphql", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "{ hello }" }),
      }),
    );

    expect(res.status).toBe(400);
  });

  it("defaults to status 200 when Apollo returns no status", async () => {
    const { server } = makeMockServer(makeApolloResult({ status: undefined }));
    const handler = createApolloFetchHandler(server, noopCtx);

    const res = await handler(new Request("http://localhost/graphql"));

    expect(res.status).toBe(200);
  });

  it("forwards Apollo response headers to the Fetch Response", async () => {
    const headers = new Map([
      ["content-type", "application/json"],
      ["x-apollo-custom", "custom-value"],
    ]) as ApolloHttpResult["headers"];
    const { server } = makeMockServer(makeApolloResult({ headers }));
    const handler = createApolloFetchHandler(server, noopCtx);

    const res = await handler(new Request("http://localhost/graphql"));

    expect(res.headers.get("x-apollo-custom")).toBe("custom-value");
  });

  it("returns the complete body string in the Fetch Response", async () => {
    const { server } = makeMockServer(
      makeApolloResult({
        body: { kind: "complete", string: '{"data":{"hello":"world"}}' },
      }),
    );
    const handler = createApolloFetchHandler(server, noopCtx);

    const res = await handler(new Request("http://localhost/graphql"));
    const text = await res.text();

    expect(text).toBe('{"data":{"hello":"world"}}');
  });

  it("joins asyncIterator chunks into a single body string", async () => {
    async function* makeChunks() {
      yield '{"data":';
      yield '{"hello":"world"}}';
    }

    const { server } = makeMockServer(
      makeApolloResult({
        body: { kind: "chunked", asyncIterator: makeChunks() },
      }),
    );
    const handler = createApolloFetchHandler(server, noopCtx);

    const res = await handler(new Request("http://localhost/graphql"));
    const text = await res.text();

    expect(text).toBe('{"data":{"hello":"world"}}');
  });
});

// ─── createApolloFetchHandler – context factory invocation ───────────────────

describe("createApolloFetchHandler – context factory", () => {
  it("calls the context factory once per request", async () => {
    const ctxFactory = vi.fn().mockResolvedValue({ headers: {}, db: null });
    const { server } = makeMockServer();
    const handler = createApolloFetchHandler(
      server,
      ctxFactory as GatewayContextFactory<Context>,
    );

    const makeReq = () =>
      new Request("http://localhost/graphql", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "{ hello }" }),
      });

    await handler(makeReq());
    await handler(makeReq());

    // The context factory is called lazily inside executeHTTPGraphQLRequest's
    // context() callback — trigger it by calling the context fn directly.
    const calls = (server.executeHTTPGraphQLRequest as ReturnType<typeof vi.fn>)
      .mock.calls;
    for (const [{ context }] of calls) {
      await context();
    }

    expect(ctxFactory).toHaveBeenCalledTimes(2);
  });
});
