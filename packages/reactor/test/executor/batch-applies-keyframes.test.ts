import type { Action, PHDocument } from "@powerhousedao/shared/document-model";
import {
  setModelName,
  setModelDescription,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { describe, expect, it, vi } from "vitest";
import { KyselyWriteCache } from "../../src/cache/kysely-write-cache.js";
import { SnapshotPosition } from "../../src/cache/write-cache-types.js";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../src/core/drive-container-types.js";
import { SimpleJobExecutor } from "../../src/executor/simple-job-executor.js";
import type { IKeyframeStore } from "../../src/storage/interfaces.js";
import {
  createMockCollectionMembershipCache,
  createMockDocumentMetaCache,
  createMockLogger,
  createMockOperationStore,
  createTestEventBus,
  createTestJob,
  createTestRegistry,
} from "../factories.js";

const DOC_ID = "doc-1";
const DOC_TYPE = "powerhouse/document-model";
const KEYFRAME_INTERVAL = 10;

/**
 * Keyframes bound how far a cold rebuild has to replay. The write cache mints
 * one whenever it is handed a revision on the interval, so which revisions the
 * executor hands it is what decides whether any exist.
 *
 * A batched job hands over its head, so a run whose head does not land on the
 * interval skips every boundary it crossed. These run the same job both ways
 * against a real write cache and compare the keyframes left behind.
 */
describe("batched applies: keyframes", () => {
  function seedDocument(): PHDocument {
    return {
      header: {
        protocolVersions: { "base-reducer": 2 },
        id: DOC_ID,
        documentType: DOC_TYPE,
        revision: { document: 1, global: 0 },
        name: "",
      },
      operations: { document: [], global: [], local: [] },
      state: {
        global: { name: "", description: "" },
        local: {},
        document: { isDeleted: false, version: 1 },
        auth: { version: 0, grants: [] },
      },
    } as unknown as PHDocument;
  }

  function actions(count: number): Action[] {
    const out: Action[] = [];
    for (let i = 0; i < count; i++) {
      out.push(
        i % 2 === 0
          ? setModelName({ name: `n-${i}` })
          : setModelDescription({ description: `d-${i}` }),
      );
    }
    return out;
  }

  /** The revisions the run persisted a keyframe at. */
  async function keyframeRevisions(
    batchApplies: boolean,
    count: number,
  ): Promise<number[]> {
    const keyframeStore: IKeyframeStore = {
      putKeyframe: vi.fn().mockResolvedValue(undefined),
      findNearestKeyframe: vi.fn().mockResolvedValue(undefined),
      listKeyframes: vi.fn().mockResolvedValue([]),
      deleteKeyframes: vi.fn().mockResolvedValue(0),
    };
    const operationStore = createMockOperationStore();
    const writeCache = new KyselyWriteCache(
      keyframeStore,
      operationStore,
      createTestRegistry([documentModelDocumentModelModule]),
      {
        maxDocuments: 100,
        ringBufferSize: 10,
        keyframeInterval: KEYFRAME_INTERVAL,
      },
    );
    writeCache.putState(
      DOC_ID,
      "global",
      "main",
      -1,
      seedDocument(),
      SnapshotPosition.Head,
    );

    const operationIndex: any = {
      start: vi.fn().mockReturnValue({
        createCollection: vi.fn(),
        addToCollection: vi.fn(),
        removeFromCollection: vi.fn(),
        recordGroupReferences: vi.fn(),
        write: vi.fn(),
      }),
      commit: vi.fn().mockResolvedValue([]),
      find: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      getCollectionsForDocuments: vi.fn().mockResolvedValue({}),
      getGroupReferencers: vi.fn().mockResolvedValue([]),
    };

    const executor = new SimpleJobExecutor(
      createMockLogger(),
      createTestRegistry([documentModelDocumentModelModule]),
      operationStore,
      createTestEventBus(),
      writeCache,
      operationIndex,
      createMockDocumentMetaCache(),
      createMockCollectionMembershipCache(),
      DEFAULT_DRIVE_CONTAINER_TYPES,
      { batchApplies },
    );

    const result = await executor.executeJob(
      createTestJob({
        documentId: DOC_ID,
        scope: "global",
        branch: "main",
        actions: actions(count),
      }),
    );
    expect(result.error).toBeUndefined();

    const calls = (
      keyframeStore.putKeyframe as ReturnType<typeof vi.fn>
    ).mock.calls.filter((call) => call[1] === "global");

    // A rebuild resumes from the revision the stored document carries, not
    // the row's label, so a keyframe minted mid-run has to agree with the
    // point it was minted at.
    for (const call of calls) {
      expect((call[4] as PHDocument).header.revision.global).toBe(
        (call[3] as number) + 1,
      );
    }

    return calls.map((call) => call[3] as number);
  }

  it("keeps the keyframe a run crosses when its head does not land on one", async () => {
    // 12 operations occupy indices 0..11, so the run crosses 10 and ends at 11.
    expect(await keyframeRevisions(false, 12)).toEqual([KEYFRAME_INTERVAL]);
    expect(await keyframeRevisions(true, 12)).toEqual([KEYFRAME_INTERVAL]);
  });

  it("keeps every boundary a longer run crosses", async () => {
    expect(await keyframeRevisions(true, 25)).toEqual([10, 20]);
  });

  it("leaves the same keyframes as writing one at a time", async () => {
    expect(await keyframeRevisions(true, 23)).toEqual(
      await keyframeRevisions(false, 23),
    );
  });
});
