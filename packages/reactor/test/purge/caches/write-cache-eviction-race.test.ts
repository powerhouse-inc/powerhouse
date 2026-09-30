import { generateId } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KyselyWriteCache } from "../../../src/cache/kysely-write-cache.js";
import { DocumentModelRegistry } from "../../../src/registry/implementation.js";
import type { IOperationStore } from "../../../src/storage/interfaces.js";
import type { KyselyKeyframeStore } from "../../../src/storage/kysely/keyframe-store.js";
import type { KyselyOperationStore } from "../../../src/storage/kysely/store.js";
import { createTestOperationStorePostgres } from "../../factories.js";
import { appendGlobal, createDocument } from "./fixtures.js";

describe("write cache eviction during a rebuild", () => {
  let store: KyselyOperationStore;
  let keyframeStore: KyselyKeyframeStore;
  let registry: DocumentModelRegistry;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await createTestOperationStorePostgres();
    store = setup.store;
    keyframeStore = setup.keyframeStore;
    registry = new DocumentModelRegistry();
    registry.registerModules(documentModelDocumentModelModule);
    cleanup = setup.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  // Holds the first read until released, as a rebuild overtaken by a purge.
  function gatedStore(): {
    gated: IOperationStore;
    release: () => void;
    reached: Promise<void>;
  } {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let reach!: () => void;
    const reached = new Promise<void>((resolve) => (reach = resolve));
    let first = true;
    const gated = new Proxy(store, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver) as unknown;
        if (key !== "getSince" || typeof value !== "function") {
          return typeof value === "function" ? value.bind(target) : value;
        }
        return async (...args: unknown[]) => {
          const result = await (
            value as (...a: unknown[]) => Promise<unknown>
          ).apply(target, args);
          if (first) {
            first = false;
            reach();
            await gate;
          }
          return result;
        };
      },
    });
    return { gated, release, reached };
  }

  it.each([
    ["document", undefined, undefined],
    ["stream", "global", "main"],
  ] as const)(
    "does not cache a rebuild a %s invalidation overtook",
    async (_level, scope, branch) => {
      const documentId = generateId();
      await createDocument(store, documentId);
      await appendGlobal(store, documentId, 2);
      const { gated, release, reached } = gatedStore();
      const cache = new KyselyWriteCache(keyframeStore, gated, registry, {
        maxDocuments: 10,
        ringBufferSize: 5,
        keyframeInterval: 1000,
      });

      const pending = cache.getState(documentId, "global", "main");
      await reached;
      cache.invalidate(documentId, scope, branch);
      release();
      const document = await pending;

      expect(document.header.id).toBe(documentId);
      expect(cache.getStream(documentId, "global", "main")).toBeUndefined();
    },
  );

  it("caches a rebuild nothing overtook", async () => {
    const documentId = generateId();
    await createDocument(store, documentId);
    await appendGlobal(store, documentId, 2);
    const cache = new KyselyWriteCache(keyframeStore, store, registry, {
      maxDocuments: 10,
      ringBufferSize: 5,
      keyframeInterval: 1000,
    });
    await cache.getState(documentId, "global", "main");
    expect(cache.getStream(documentId, "global", "main")).toBeDefined();
  });
});
