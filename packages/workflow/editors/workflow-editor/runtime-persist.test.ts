import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  openIdbCacheStore,
  persistRuntimeQueries,
  RUNTIME_CACHE_MAX_AGE_MS,
  RUNTIME_CACHE_VERSION,
  shouldPersistQuery,
  type PersistedQuery,
  type RuntimeCacheStore,
} from "./runtime-persist.js";
import { runtimeKeys } from "./ui/query-keys.js";

const URL_A = "http://a/graphql/workflow-runtime";
const PIECE_FORM = {
  pieceName: "@activepieces/piece-slack",
  pieceVersion: "1.0.0",
  kind: "action" as const,
  name: "send_message",
};
const CORE_FORM = {
  pieceName: "@powerhousedao/piece-core",
  pieceVersion: "1.0.0",
  kind: "action" as const,
  name: "branch",
};

function memoryStore(): RuntimeCacheStore & {
  rows: Map<string, PersistedQuery>;
} {
  const rows = new Map<string, PersistedQuery>();
  return {
    rows,
    load: (url) =>
      Promise.resolve([...rows.values()].filter((row) => row.url === url)),
    save: (entry) => {
      rows.set(entry.id, entry);
      return Promise.resolve();
    },
    remove: (id) => {
      rows.delete(id);
      return Promise.resolve();
    },
  };
}

const failingStore: RuntimeCacheStore = {
  load: () => Promise.reject(new Error("quota")),
  save: () => Promise.reject(new Error("quota")),
  remove: () => Promise.reject(new Error("quota")),
};

// Lets the cache subscription's fire-and-forget writes land.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("shouldPersistQuery", () => {
  it("keeps only the catalog and piece block forms", () => {
    expect(shouldPersistQuery(runtimeKeys.catalog(URL_A))).toBe(true);
    expect(shouldPersistQuery(runtimeKeys.form(URL_A, PIECE_FORM))).toBe(true);
    const input = {
      block: PIECE_FORM,
      propName: "channel",
      refreshers: [],
      connectionId: "c1",
    };
    for (const key of [
      runtimeKeys.form(URL_A, CORE_FORM),
      runtimeKeys.options(URL_A, input),
      runtimeKeys.dynamic(URL_A, input),
      runtimeKeys.connections(URL_A),
      runtimeKeys.runs(URL_A, { workflowId: "w1" }),
      runtimeKeys.runPages(URL_A, { driveId: "d1" }),
      runtimeKeys.run(URL_A, "run-1"),
      runtimeKeys.secret(URL_A, "secret://v1:x"),
      runtimeKeys.webhook(URL_A, "w1"),
      runtimeKeys.latestRun(URL_A, "w1"),
    ]) {
      expect(shouldPersistQuery(key)).toBe(false);
    }
  });
});

describe("persistRuntimeQueries", () => {
  it("writes catalog and form fetches, and nothing caller-scoped", async () => {
    const store = memoryStore();
    const queryClient = new QueryClient();
    const persisted = persistRuntimeQueries(queryClient, URL_A, store);
    await persisted.ready;

    await queryClient.fetchQuery({
      queryKey: runtimeKeys.catalog(URL_A),
      queryFn: () => [{ name: "slack" }],
    });
    await queryClient.fetchQuery({
      queryKey: runtimeKeys.form(URL_A, PIECE_FORM),
      queryFn: () => ({ title: "Send", props: [] }),
    });
    await queryClient.fetchQuery({
      queryKey: runtimeKeys.connections(URL_A),
      queryFn: () => [{ id: "c1" }],
    });
    await queryClient.fetchQuery({
      queryKey: runtimeKeys.options(URL_A, {
        block: PIECE_FORM,
        propName: "channel",
        refreshers: [],
      }),
      queryFn: () => ({ options: [] }),
    });
    await settle();
    persisted.dispose();

    expect([...store.rows.values()].map((row) => row.queryKey)).toEqual([
      runtimeKeys.catalog(URL_A),
      runtimeKeys.form(URL_A, PIECE_FORM),
    ]);
  });

  it("hydrates a fresh cache from the store, per runtime URL", async () => {
    const store = memoryStore();
    const now = Date.now();
    const row = (url: string, data: unknown, updatedAt = now) => ({
      id: JSON.stringify(runtimeKeys.catalog(url)),
      url,
      queryKey: runtimeKeys.catalog(url),
      data,
      updatedAt,
      version: RUNTIME_CACHE_VERSION,
    });
    await store.save(row(URL_A, ["a"]));
    await store.save(row("http://b/rt", ["b"]));

    const queryClient = new QueryClient();
    await persistRuntimeQueries(queryClient, URL_A, store).ready;

    expect(queryClient.getQueryData(runtimeKeys.catalog(URL_A))).toEqual(["a"]);
    expect(
      queryClient.getQueryData(runtimeKeys.catalog("http://b/rt")),
    ).toBeUndefined();
    // Hydrated with its stored age, so an observer revalidates it.
    expect(
      queryClient.getQueryState(runtimeKeys.catalog(URL_A))?.dataUpdatedAt,
    ).toBe(now);
  });

  it("drops entries past their age or from another cache version", async () => {
    const store = memoryStore();
    const now = Date.now();
    const key = runtimeKeys.catalog(URL_A);
    await store.save({
      id: "old",
      url: URL_A,
      queryKey: key,
      data: ["old"],
      updatedAt: now - RUNTIME_CACHE_MAX_AGE_MS - 1,
      version: RUNTIME_CACHE_VERSION,
    });
    await store.save({
      id: "stale-version",
      url: URL_A,
      queryKey: runtimeKeys.form(URL_A, PIECE_FORM),
      data: {},
      updatedAt: now,
      version: RUNTIME_CACHE_VERSION - 1,
    });

    const queryClient = new QueryClient();
    await persistRuntimeQueries(queryClient, URL_A, store, () => now).ready;
    await settle();

    expect(queryClient.getQueryData(key)).toBeUndefined();
    expect(store.rows.size).toBe(0);
  });

  it("never overwrites an answer that landed before hydration", async () => {
    const store = memoryStore();
    const key = runtimeKeys.catalog(URL_A);
    await store.save({
      id: JSON.stringify(key),
      url: URL_A,
      queryKey: key,
      data: ["disk"],
      updatedAt: Date.now() - 1000,
      version: RUNTIME_CACHE_VERSION,
    });
    const queryClient = new QueryClient();
    await queryClient.fetchQuery({ queryKey: key, queryFn: () => ["network"] });

    await persistRuntimeQueries(queryClient, URL_A, store).ready;

    expect(queryClient.getQueryData(key)).toEqual(["network"]);
  });

  it("keeps working when the store fails", async () => {
    const queryClient = new QueryClient();
    const persisted = persistRuntimeQueries(queryClient, URL_A, failingStore);
    await expect(persisted.ready).resolves.toBeUndefined();

    const data = await queryClient.fetchQuery({
      queryKey: runtimeKeys.catalog(URL_A),
      queryFn: () => ["live"],
    });
    await settle();

    expect(data).toEqual(["live"]);
    persisted.dispose();
  });
});

describe("openIdbCacheStore", () => {
  it("is off where the browser has no IndexedDB", () => {
    expect(openIdbCacheStore()).toBeNull();
  });

  it("rejects, rather than throws, when IndexedDB refuses to open", async () => {
    vi.stubGlobal("indexedDB", {
      open: () => {
        throw new Error("SecurityError: private mode");
      },
    });
    const store = openIdbCacheStore();
    expect(store).not.toBeNull();
    await expect(store!.load(URL_A)).rejects.toThrow("private mode");

    const queryClient = new QueryClient();
    const persisted = persistRuntimeQueries(queryClient, URL_A, store);
    await expect(persisted.ready).resolves.toBeUndefined();
    await queryClient.fetchQuery({
      queryKey: runtimeKeys.catalog(URL_A),
      queryFn: () => ["live"],
    });
    await settle();
    expect(queryClient.getQueryData(runtimeKeys.catalog(URL_A))).toEqual([
      "live",
    ]);
    persisted.dispose();
  });
});
