import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as RuntimeApiModule from "./runtime-api.js";

const ambientRenownTokenProvider = vi.fn();

vi.mock("@powerhousedao/reactor-browser/graphql-client", () => ({
  ambientRenownTokenProvider,
}));

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

let runtimeApi: typeof RuntimeApiModule;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  runtimeApi = await import("./runtime-api.js");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(): ReturnType<
  typeof vi.fn<(url: string, init: RequestInit) => Promise<Response>>
> {
  const fetchMock = vi.fn((_url: string, _init: RequestInit) =>
    Promise.resolve(jsonResponse({ workflowRuntime: { connections: [] } })),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("gql (via fetchConnections)", () => {
  it("attaches the Renown bearer token when one resolves", async () => {
    ambientRenownTokenProvider.mockResolvedValue("token-123");
    const fetchMock = stubFetch();

    await runtimeApi.fetchConnections();

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).toMatchObject({
      authorization: "Bearer token-123",
    });
  });

  it("sends the request anonymously when no token resolves", async () => {
    ambientRenownTokenProvider.mockResolvedValue(undefined);
    const fetchMock = stubFetch();

    await runtimeApi.fetchConnections();

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).not.toHaveProperty("authorization");
  });
});
