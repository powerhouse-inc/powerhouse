import type { PHDocument } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyWriteCache } from "../../../src/cache/kysely-write-cache.js";
import { SnapshotPosition } from "../../../src/cache/write-cache-types.js";
import type { IDocumentModelRegistry } from "../../../src/registry/interfaces.js";
import type {
  IKeyframeStore,
  IOperationStore,
} from "../../../src/storage/interfaces.js";
import type { KeyframeSettings } from "../../../src/storage/keyframes/keyframe-settings.js";

function documentOfType(documentType: string): PHDocument {
  const document = documentModelDocumentModelModule.utils.createDocument();
  return {
    ...document,
    header: { ...document.header, documentType },
  };
}

function writtenRevisions(store: IKeyframeStore): number[] {
  return vi
    .mocked(store.putKeyframe)
    .mock.calls.map(([, , , revision]) => revision);
}

describe("keyframe intervals per document type", () => {
  let keyframeStore: IKeyframeStore;

  beforeEach(() => {
    keyframeStore = {
      putKeyframe: vi.fn().mockResolvedValue(undefined),
      findNearestKeyframe: vi.fn().mockResolvedValue(undefined),
      listKeyframes: vi.fn().mockResolvedValue([]),
      deleteKeyframes: vi.fn().mockResolvedValue(0),
    };
  });

  function cacheWith(
    keyframeInterval: number,
    keyframes?: KeyframeSettings,
  ): KyselyWriteCache {
    return new KyselyWriteCache(
      keyframeStore,
      {} as IOperationStore,
      {} as IDocumentModelRegistry,
      { maxDocuments: 10, ringBufferSize: 5, keyframeInterval, keyframes },
    );
  }

  function putHeads(
    cache: KyselyWriteCache,
    documentType: string,
    revisions: number[],
  ): void {
    const document = documentOfType(documentType);
    for (const revision of revisions) {
      cache.putState(
        `doc-${documentType}`,
        "global",
        "main",
        revision,
        document,
        SnapshotPosition.Head,
      );
    }
  }

  const revisions = Array.from({ length: 60 }, (_, index) => index + 1);

  it("mints every keyframeInterval revisions with nothing configured", () => {
    putHeads(cacheWith(10), "a/b", revisions);
    expect(writtenRevisions(keyframeStore)).toEqual([10, 20, 30, 40, 50, 60]);
  });

  it("takes the type's interval over the default and the cache's", () => {
    const cache = cacheWith(10, {
      default: { interval: 25 },
      types: { "a/sparse": { interval: 50 } },
    });
    putHeads(cache, "a/sparse", revisions);
    expect(writtenRevisions(keyframeStore)).toEqual([50]);

    vi.mocked(keyframeStore.putKeyframe).mockClear();
    putHeads(cache, "a/other", revisions);
    expect(writtenRevisions(keyframeStore)).toEqual([25, 50]);
  });

  it("crosses every boundary of a run at the type's interval", () => {
    const cache = cacheWith(10, { types: { "a/b": { interval: 3 } } });
    const document = documentOfType("a/b");
    cache.putRun(
      "doc-1",
      "global",
      "main",
      [1, 2, 3, 4, 5, 6, 7].map((revision) => ({ revision, document })),
    );
    expect(writtenRevisions(keyframeStore)).toEqual([3, 6]);
  });

  it("never mints at revision 0", () => {
    putHeads(cacheWith(1), "a/b", [0]);
    expect(writtenRevisions(keyframeStore)).toEqual([]);
  });

  it("keeps a scoped cache on the same rules", () => {
    const cache = cacheWith(10, { types: { "a/b": { interval: 7 } } });
    const scoped = cache.withScopedStores({} as IOperationStore, keyframeStore);
    putHeads(scoped, "a/b", [7, 10]);
    expect(writtenRevisions(keyframeStore)).toEqual([7]);
  });
});
