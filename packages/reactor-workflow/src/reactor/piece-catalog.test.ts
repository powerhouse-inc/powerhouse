import { setPieceRegistryUrl } from "../pieces/activepieces/registry-source.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildSearchIndex } from "./block-search.js";
import {
  fetchCatalogWithSuggestions,
  fetchPieceCatalog,
  fetchPieceDetail,
  fetchPieceTriggers,
  __resetCatalogCacheForTests,
} from "./piece-catalog.js";

// The catalog fetcher uses global fetch; stub it per test.
function stubCatalog(entries: unknown[]) {
  vi.stubGlobal("fetch", ((input: unknown) => {
    expect(String(input)).toContain("cloud.activepieces.com/api/v1/pieces");
    return Promise.resolve(
      new Response(JSON.stringify(entries), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as never);
}

beforeEach(__resetCatalogCacheForTests);
afterEach(() => {
  vi.unstubAllGlobals();
  setPieceRegistryUrl(undefined);
});

it("is empty when no source lists anything", async () => {
  stubCatalog([]);
  expect(await fetchPieceCatalog()).toEqual([]);
});

it("keeps server-only pieces filtered", async () => {
  stubCatalog([
    { name: "@activepieces/piece-ai", version: "1.0.0", actions: 1 },
  ]);
  const catalog = await fetchPieceCatalog();
  expect(
    catalog.find((p) => p.name === "@activepieces/piece-ai"),
  ).toBeUndefined();
});

// Auth and trigger fields as the cloud listing serves them (0.91.0), trimmed.
const ISSUES = "https://github.com/powerhouse-inc/powerhouse/issues";
const LISTED_AUTH = {
  "google-drive": [
    { type: "OAUTH2", displayName: "Connection", required: true },
    { type: "OIDC", displayName: "Workload identity", required: true },
  ],
  gmail: [
    { type: "OAUTH2", displayName: "Connection", required: true },
    { type: "CUSTOM_AUTH", displayName: "Service account", required: true },
  ],
  slack: { type: "OAUTH2", displayName: "Connection", required: true },
  "aws-s3": { type: "OIDC", displayName: "Workload identity", required: true },
  omnihr: { type: "CUSTOM_AUTH", required: true, refresh: {} },
  notion: { type: "SECRET_TEXT", required: true },
};

it("flags the listed pieces whose auth this engine cannot run", async () => {
  stubCatalog(
    Object.entries(LISTED_AUTH).map(([name, auth]) => ({
      name: `@activepieces/piece-${name}`,
      displayName: name,
      version: "1.0.0",
      actions: 1,
      auth,
    })),
  );
  const catalog = await fetchPieceCatalog();
  expect(
    Object.fromEntries(catalog.map((p) => [p.displayName, p.unsupported])),
  ).toEqual({
    gmail: undefined,
    // OAuth2 runs; OIDC alone would not.
    "google-drive": undefined,
    slack: undefined,
    "aws-s3": `OIDC auth is not supported yet (${ISSUES}/3091)`,
    omnihr: `CustomAuth refresh is not supported yet (${ISSUES}/3091)`,
    notion: undefined,
  });
});

it("flags a listed trigger that is MANUAL or renews in a way that cannot run", async () => {
  vi.stubGlobal("fetch", (() =>
    Promise.resolve(
      Response.json({
        name: "@activepieces/piece-google-calendar",
        version: "0.12.0",
        auth: { type: "SECRET_TEXT" },
        triggers: {
          new_event: {
            type: "WEBHOOK",
            renewConfiguration: {
              strategy: "CRON",
              cronExpression: "0 */12 * * *",
            },
          },
          event_started: {
            type: "WEBHOOK",
            renewConfiguration: { strategy: "CRON", cronExpression: "never" },
          },
          manual_trigger: {
            type: "MANUAL",
            renewConfiguration: { strategy: "NONE" },
          },
          event_ended: {
            type: "POLLING",
            renewConfiguration: { strategy: "NONE" },
          },
        },
      }),
    )) as never);
  const { triggers } = await fetchPieceTriggers(
    "@activepieces/piece-google-calendar",
  );
  expect(
    Object.fromEntries(triggers.map((t) => [t.name, t.unsupported])),
  ).toEqual({
    new_event: undefined,
    event_started: `renewConfiguration cron "never" is invalid (${ISSUES}/3090)`,
    manual_trigger: `TriggerStrategy.MANUAL is not supported yet (${ISSUES}/3091)`,
    event_ended: undefined,
  });
});

const REGISTRY = "https://registry.example.com";

// Two published sources, answered by URL: the cloud list, and the same three
// endpoints served by a Powerhouse registry.
function stubSources(sources: {
  cloud?: unknown[] | "unreachable";
  registry?: unknown[] | "unreachable";
}) {
  vi.stubGlobal("fetch", ((input: unknown) => {
    const url = String(input);
    const fromRegistry = url.startsWith(REGISTRY);
    const answer = fromRegistry ? sources.registry : sources.cloud;
    if (answer === undefined || answer === "unreachable") {
      return Promise.resolve(new Response("down", { status: 503 }));
    }
    const body = fromRegistry
      ? {
          items: answer,
          total: answer.length,
          limit: 50,
          offset: 0,
          hasMore: false,
        }
      : answer;
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as never);
}

function entry(name: string, displayName: string) {
  return { name, displayName, version: "1.0.0", actions: 1, triggers: 0 };
}

it("lists the pieces an allowed registry serves alongside the cloud's", async () => {
  setPieceRegistryUrl(REGISTRY);
  stubSources({
    cloud: [entry("@activepieces/piece-slack", "Slack")],
    registry: [entry("@acme/piece-invoices", "Invoices")],
  });
  const catalog = await fetchPieceCatalog();
  expect(catalog.find((p) => p.name === "@acme/piece-invoices")).toMatchObject({
    displayName: "Invoices",
    version: "1.0.0",
    actionCount: 1,
    source: "registry",
  });
  expect(
    catalog.find((p) => p.name === "@activepieces/piece-slack")?.source,
  ).toBe("activepieces");
});

it("prefers the registry's copy of a name the cloud also lists", async () => {
  setPieceRegistryUrl(REGISTRY);
  stubSources({
    cloud: [entry("@acme/piece-invoices", "Invoices (cloud)")],
    registry: [entry("@acme/piece-invoices", "Invoices (registry)")],
  });
  const matches = (await fetchPieceCatalog()).filter(
    (p) => p.name === "@acme/piece-invoices",
  );
  expect(matches).toHaveLength(1);
  expect(matches[0]?.displayName).toBe("Invoices (registry)");
  expect(matches[0]?.source).toBe("registry");
});

it("serves the registry's pieces when the cloud catalog is unreachable", async () => {
  setPieceRegistryUrl(REGISTRY);
  stubSources({
    cloud: "unreachable",
    registry: [entry("@acme/piece-invoices", "Invoices")],
  });
  const catalog = await fetchPieceCatalog();
  expect(catalog.find((p) => p.name === "@acme/piece-invoices")).toBeDefined();
});

it("fails when every published source fails", async () => {
  setPieceRegistryUrl(REGISTRY);
  stubSources({ cloud: "unreachable", registry: "unreachable" });
  await expect(fetchPieceCatalog()).rejects.toThrow(/responded 503/);
});

it("indexes the registry's blocks for block search", async () => {
  setPieceRegistryUrl(REGISTRY);
  stubSources({
    cloud: "unreachable",
    registry: [
      {
        name: "@acme/piece-invoices",
        displayName: "Invoices",
        version: "1.0.0",
        suggestedActions: [{ name: "send", displayName: "Send invoice" }],
        suggestedTriggers: [],
      },
    ],
  });
  const index = buildSearchIndex(await fetchCatalogWithSuggestions());
  expect(index.pieces.map((piece) => piece.meta.source)).toEqual(["registry"]);
  expect(index.pieces[0].blocks.map((block) => block.hit)).toEqual([
    expect.objectContaining({
      pieceName: "@acme/piece-invoices",
      pieceVersion: "1.0.0",
      kind: "action",
      name: "send",
    }),
  ]);
});

// A registry serving the catalog across several pages.
function stubPagedRegistry(entries: unknown[]) {
  const seen: URL[] = [];
  vi.stubGlobal("fetch", ((input: unknown) => {
    const url = new URL(String(input));
    if (!url.href.startsWith(REGISTRY)) {
      return Promise.resolve(new Response("down", { status: 503 }));
    }
    seen.push(url);
    const limit = Number(url.searchParams.get("limit"));
    const offset = Number(url.searchParams.get("offset"));
    return Promise.resolve(
      Response.json({
        items: entries.slice(offset, offset + limit),
        total: entries.length,
        limit,
        offset,
        hasMore: offset + limit < entries.length,
      }),
    );
  }) as never);
  return seen;
}

it("pages through a registry catalog larger than one page", async () => {
  setPieceRegistryUrl(REGISTRY);
  const entries = Array.from({ length: 120 }, (_, i) =>
    entry(`@acme/piece-${String(i).padStart(3, "0")}`, `Piece ${i}`),
  );
  const seen = stubPagedRegistry(entries);
  const catalog = await fetchPieceCatalog();
  expect(catalog).toHaveLength(120);
  expect(
    seen.map((u) => [
      u.searchParams.get("limit"),
      u.searchParams.get("offset"),
    ]),
  ).toEqual([
    ["50", "0"],
    ["50", "50"],
    ["50", "100"],
  ]);
});

it("keeps asking for suggestions on every registry page", async () => {
  setPieceRegistryUrl(REGISTRY);
  const entries = Array.from({ length: 60 }, (_, i) => ({
    name: `@acme/piece-${i}`,
    displayName: `Piece ${i}`,
    version: "1.0.0",
    suggestedActions: [{ name: "send", displayName: "Send" }],
    suggestedTriggers: [],
  }));
  const seen = stubPagedRegistry(entries);
  expect(await fetchCatalogWithSuggestions()).toHaveLength(60);
  expect(seen).toHaveLength(2);
  for (const url of seen) {
    expect(url.searchParams.get("suggestionType")).toBe("ACTION_AND_TRIGGER");
  }
});

it("skips a registry that answers without a page", async () => {
  setPieceRegistryUrl(REGISTRY);
  vi.stubGlobal("fetch", ((input: unknown) =>
    Promise.resolve(
      Response.json(
        String(input).startsWith(REGISTRY)
          ? [entry("@acme/piece-invoices", "Invoices")]
          : [entry("@activepieces/piece-slack", "Slack")],
      ),
    )) as never);
  expect((await fetchPieceCatalog()).map((p) => p.name)).toEqual([
    "@activepieces/piece-slack",
  ]);
});

// The registry answers with `registry`: a status, or "down" for a refused
// connection.
function stubPieceDetail(registry: number | "down") {
  const seen: string[] = [];
  vi.stubGlobal("fetch", ((input: unknown) => {
    const url = String(input);
    seen.push(url);
    if (url.startsWith(REGISTRY)) {
      return registry === "down"
        ? Promise.reject(new TypeError("fetch failed"))
        : Promise.resolve(new Response("no", { status: registry }));
    }
    return Promise.resolve(
      new Response(JSON.stringify({ name: "p", version: "9.9.9" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as never);
  return seen;
}

it.each([
  ["says it has no such piece", 404],
  ["answers 503", 503],
  ["refuses the connection", "down"],
] as const)("asks the cloud when the registry %s", async (_, registry) => {
  setPieceRegistryUrl(REGISTRY);
  const seen = stubPieceDetail(registry);

  // A name per case: piece details are cached across tests.
  expect(await fetchPieceDetail(`@acme/piece-${registry}`)).toEqual({
    name: "p",
    version: "9.9.9",
  });
  expect(seen.some((url) => url.includes("cloud.activepieces.com"))).toBe(true);
});

it("reads a piece's triggers while the registry is down", async () => {
  setPieceRegistryUrl(REGISTRY);
  stubPieceDetail("down");

  expect(await fetchPieceTriggers("@acme/piece-z")).toMatchObject({
    name: "@acme/piece-z",
    version: "9.9.9",
  });
});

it("lists a new publish within five minutes", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    let calls = 0;
    vi.stubGlobal("fetch", (() => {
      calls++;
      return Promise.resolve(Response.json([]));
    }) as never);
    await fetchPieceCatalog();
    vi.advanceTimersByTime(4 * 60_000);
    await fetchPieceCatalog();
    expect(calls).toBe(1);
    vi.advanceTimersByTime(2 * 60_000);
    await fetchPieceCatalog();
    expect(calls).toBe(2);
  } finally {
    vi.useRealTimers();
  }
});

it("keeps an exact version's detail for an hour and a moving one for minutes", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    const asked: string[] = [];
    vi.stubGlobal("fetch", ((input: unknown) => {
      asked.push(String(input));
      return Promise.resolve(
        Response.json({ name: "@acme/piece-ttl", version: "1.0.0" }),
      );
    }) as never);
    await fetchPieceDetail("@acme/piece-ttl", "1.0.0");
    await fetchPieceDetail("@acme/piece-ttl");
    vi.advanceTimersByTime(6 * 60_000);
    await fetchPieceDetail("@acme/piece-ttl", "1.0.0");
    await fetchPieceDetail("@acme/piece-ttl");
    // Only the moving one was asked again
    expect(asked).toHaveLength(3);
    vi.advanceTimersByTime(60 * 60_000);
    await fetchPieceDetail("@acme/piece-ttl", "1.0.0");
    expect(asked).toHaveLength(4);
  } finally {
    vi.useRealTimers();
  }
});
