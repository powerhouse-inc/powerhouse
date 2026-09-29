import { InfiniteQueryObserver, MutationObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as RuntimeClientModule from "./runtime-client.js";
import {
  catalogQuery,
  createRuntimeQueryClient,
  runPagesQuery,
  runsOfPages,
  testStepMutation,
} from "./runtime-queries.js";
import { runtimeKeys } from "./ui/query-keys.js";

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

let runtimeClient: typeof RuntimeClientModule;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  runtimeClient = await import("./runtime-client.js");
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

    await runtimeClient
      .createRuntimeClient("http://a/graphql")
      .fetchConnections();

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).toMatchObject({
      authorization: "Bearer token-123",
    });
  });

  it("sends the request anonymously when no token resolves", async () => {
    ambientRenownTokenProvider.mockResolvedValue(undefined);
    const fetchMock = stubFetch();

    await runtimeClient
      .createRuntimeClient("http://a/graphql")
      .fetchConnections();

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).not.toHaveProperty("authorization");
  });
});

// A fake runtime per URL, answering the catalog with that URL's own piece.
function runtimeServer() {
  const calls: string[] = [];
  const fetchFn = (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : input.toString();
    calls.push(url);
    return Promise.resolve(
      jsonResponse({
        workflowRuntime: { pieceCatalog: [{ name: `piece@${url}` }] },
      }),
    );
  };
  return { calls, fetch: fetchFn as typeof fetch };
}

describe("RuntimeClient isolation", () => {
  it("sends each client's calls to its own URL", async () => {
    const server = runtimeServer();
    const token = () => Promise.resolve(null);
    const a = runtimeClient.createRuntimeClient("http://a/rt", {
      fetch: server.fetch,
      token,
    });
    const b = runtimeClient.createRuntimeClient("http://b/rt", {
      fetch: server.fetch,
      token,
    });

    const [fromA, fromB] = await Promise.all([
      a.fetchPieceCatalog(),
      b.fetchPieceCatalog(),
    ]);

    expect(fromA[0].name).toBe("piece@http://a/rt");
    expect(fromB[0].name).toBe("piece@http://b/rt");
    expect(server.calls.sort()).toEqual(["http://a/rt", "http://b/rt"]);
  });

  it("keeps two runtimes' answers apart in one query cache", async () => {
    const server = runtimeServer();
    const token = () => Promise.resolve(null);
    const a = runtimeClient.createRuntimeClient("http://a/rt", {
      fetch: server.fetch,
      token,
    });
    const b = runtimeClient.createRuntimeClient("http://b/rt", {
      fetch: server.fetch,
      token,
    });
    const queryClient = createRuntimeQueryClient();

    await queryClient.fetchQuery(catalogQuery(a));
    await queryClient.fetchQuery(catalogQuery(b));
    // Cached: neither refetches, and neither sees the other's catalog.
    const againA = await queryClient.fetchQuery(catalogQuery(a));
    const againB = await queryClient.fetchQuery(catalogQuery(b));

    expect(againA[0].name).toBe("piece@http://a/rt");
    expect(againB[0].name).toBe("piece@http://b/rt");
    expect(server.calls).toHaveLength(2);
    expect(catalogQuery(a).queryKey[0]).toBe("http://a/rt");
  });
});

// A runtime that answers every query with `answer` and records the requests.
function answering(answer: unknown) {
  const bodies: { query: string; variables: unknown }[] = [];
  const fetchFn = (_input: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(
      JSON.parse(init!.body as string) as { query: string; variables: unknown },
    );
    return Promise.resolve(jsonResponse({ workflowRuntime: answer }));
  };
  const client = runtimeClient.createRuntimeClient("http://a/rt", {
    fetch: fetchFn as typeof fetch,
    token: () => Promise.resolve(null),
  });
  return { bodies, client };
}

describe("blockResolutions", () => {
  it("asks for every field of each draft block's resolution", async () => {
    const resolution = {
      stepId: "s1",
      pieceName: "@acme/piece-x",
      pieceVersion: "1.1.0",
      name: "send",
      kind: "action",
      resolvedVersion: "1.2.0",
      source: "registry",
      match: "compatible",
      note: "Pinned 1.1.0 is not available; runs 1.2.0 from registry",
      latestVersion: "2.0.0",
    };
    const { bodies, client } = answering({ blockResolutions: [resolution] });

    expect(await client.blockResolutions("wf-1")).toEqual([resolution]);
    expect(bodies[0].variables).toEqual({ workflowId: "wf-1" });
    for (const field of Object.keys(resolution)) {
      expect(bodies[0].query).toContain(field);
    }
  });
});

describe("testCoreTrigger", () => {
  it("sends the sample payload and the wait, and returns the sample", async () => {
    const { bodies, client } = answering({ testTrigger: { invoiceId: "7" } });

    expect(
      await client.testCoreTrigger("wf-1", {
        payload: { invoiceId: "7" },
        timeoutSeconds: 60,
      }),
    ).toEqual({ invoiceId: "7" });
    expect(bodies[0].variables).toEqual({
      workflowId: "wf-1",
      payload: { invoiceId: "7" },
      timeoutSeconds: 60,
      driveId: null,
    });
  });

  it("cancels a waiting webhook test", async () => {
    const { bodies, client } = answering({ cancelTriggerTest: true });

    expect(await client.cancelTriggerTest("wf-1")).toBe(true);
    expect(bodies[0].variables).toEqual({ workflowId: "wf-1" });
  });
});

describe("testStep", () => {
  it("sends the step and drops the runs and output trees it changed", async () => {
    const bodies: unknown[] = [];
    const answer = {
      runId: "run-1",
      status: "SUCCEEDED",
      output: { total: 42 },
      error: null,
      durationMs: 12,
    };
    const fetchFn = (_input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(init!.body as string) as (typeof bodies)[number]);
      return Promise.resolve(
        jsonResponse({ workflowRuntime: { testStep: answer } }),
      );
    };
    const client = runtimeClient.createRuntimeClient("http://a/rt", {
      fetch: fetchFn as typeof fetch,
      token: () => Promise.resolve(null),
    });
    const queryClient = createRuntimeQueryClient();
    const runsKey = runtimeKeys.runs(client.url, { workflowId: "wf-1" });
    const treeKey = runtimeKeys.outputTree(
      client.url,
      { pieceName: "p", pieceVersion: "1.0.0", kind: "action", name: "fetch" },
      {},
    );
    const catalogKey = runtimeKeys.catalog(client.url);
    for (const key of [runsKey, treeKey, catalogKey]) {
      queryClient.setQueryData(key, []);
    }

    const result = await new MutationObserver(
      queryClient,
      testStepMutation(client, queryClient),
    ).mutate({ workflowId: "wf-1", stepId: "s1" });

    expect(result).toEqual(answer);
    expect(bodies[0]).toMatchObject({
      variables: { workflowId: "wf-1", stepId: "s1" },
    });
    const invalidated = (key: readonly unknown[]) =>
      queryClient.getQueryState(key)?.isInvalidated;
    expect(invalidated(runsKey)).toBe(true);
    expect(invalidated(treeKey)).toBe(true);
    expect(invalidated(catalogKey)).toBe(false);
  });
});

describe("a workflow still syncing", () => {
  it("sends the drive and marks the error as retryable", async () => {
    const seen: unknown[] = [];
    const fetchFn = (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { variables: unknown };
      seen.push(body.variables);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            errors: [
              {
                message: "Workflow is still syncing; try again in a moment",
                extensions: { code: "WORKFLOW_SYNCING", retryable: true },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    };
    const client = runtimeClient.createRuntimeClient("http://a/rt", {
      fetch: fetchFn as typeof fetch,
    });

    const error = await client
      .testStep("wf", "s1", "drive-1")
      .catch((thrown: unknown) => thrown);

    expect(seen).toEqual([
      { workflowId: "wf", stepId: "s1", driveId: "drive-1" },
    ]);
    expect(runtimeClient.isSyncingError(error)).toBe(true);
    expect(runtimeClient.isSyncingError(new Error("Forbidden"))).toBe(false);
  });
});

describe("the paged runs listing", () => {
  const run = (id: string) => ({
    id,
    workflowId: "wf-1",
    workflowName: "wf",
    workflowVersion: 1,
    triggerKind: "manual",
    triggerPayload: null,
    status: "SUCCEEDED",
    error: null,
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: null,
    rerunOf: null,
    warningNotes: [],
    steps: [],
  });

  it("pages on the cursor, leaves tests and step blobs out, and drops repeats", async () => {
    const bodies: { query: string; variables: Record<string, unknown> }[] = [];
    const pages = [
      { items: [run("r3"), run("r2")], hasNextPage: true, cursor: "c1" },
      { items: [run("r2"), run("r1")], hasNextPage: false, cursor: "c2" },
    ];
    const fetchFn = (_input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(init!.body as string) as (typeof bodies)[number]);
      return Promise.resolve(
        jsonResponse({
          workflowRuntime: { runsPage: pages[bodies.length - 1] },
        }),
      );
    };
    const client = runtimeClient.createRuntimeClient("http://a/rt", {
      fetch: fetchFn as typeof fetch,
      token: () => Promise.resolve(null),
    });
    const queryClient = createRuntimeQueryClient();
    const observer = new InfiniteQueryObserver(
      queryClient,
      runPagesQuery(client, { driveId: "d1", limit: 2 }),
    );

    await observer.refetch();
    const result = await observer.fetchNextPage();

    expect(bodies.map((body) => body.variables)).toEqual([
      {
        workflowId: null,
        driveId: "d1",
        excludeTriggerKinds: ["test"],
        paging: { limit: 2, cursor: null },
      },
      {
        workflowId: null,
        driveId: "d1",
        excludeTriggerKinds: ["test"],
        paging: { limit: 2, cursor: "c1" },
      },
    ]);
    expect(bodies[0].query).not.toMatch(/\binput\b|\boutput\b/);
    expect(result.hasNextPage).toBe(false);
    expect(runsOfPages(result.data!.pages).map((r) => r.id)).toEqual([
      "r3",
      "r2",
      "r1",
    ]);
  });
});
