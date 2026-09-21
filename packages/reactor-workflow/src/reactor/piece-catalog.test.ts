import { setPieceRegistryUrl } from "../pieces/activepieces/registry-source.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildSearchIndex } from "./block-search.js";
import {
  fetchCatalogWithSuggestions,
  fetchPieceCatalog,
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

const REGISTRY = "https://registry.example.com";

// Two published sources, answered by URL: the cloud list, and the same three
// endpoints served by a Powerhouse registry.
function stubSources(sources: {
  cloud?: unknown[] | "unreachable";
  registry?: unknown[] | "unreachable";
}) {
  vi.stubGlobal("fetch", ((input: unknown) => {
    const url = String(input);
    const answer = url.startsWith(REGISTRY) ? sources.registry : sources.cloud;
    if (answer === undefined || answer === "unreachable") {
      return Promise.resolve(new Response("down", { status: 503 }));
    }
    return Promise.resolve(
      new Response(JSON.stringify(answer), {
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
  });
  expect(
    catalog.find((p) => p.name === "@activepieces/piece-slack"),
  ).toBeDefined();
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
  expect(index.entries.map((e) => e.hit.blockType)).toEqual([
    "@acme/piece-invoices@1.0.0#send",
  ]);
});
