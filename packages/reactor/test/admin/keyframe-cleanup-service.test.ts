import type { PHDocument } from "@powerhousedao/shared/document-model";
import { addModule, generateId } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import type { Kysely, KyselyPlugin } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { upgradeDocumentAction } from "../../src/actions/index.js";
import { KeyframeCleanupService } from "../../src/admin/keyframe-cleanup-service.js";
import type {
  IStoreMaintenance,
  KeyframeCleanupRun,
} from "../../src/admin/keyframe-cleanup-types.js";
import { passthroughKeyframeStore } from "../../src/admin/passthrough-keyframe-store.js";
import { KyselyWriteCache } from "../../src/cache/kysely-write-cache.js";
import type { Database } from "../../src/core/types.js";
import { CatchUpPriority } from "../../src/processors/catch-up-priority.js";
import { DocumentModelRegistry } from "../../src/registry/implementation.js";
import type { KeyframeSettings } from "../../src/storage/keyframes/keyframe-settings.js";
import type { KyselyKeyframeStore } from "../../src/storage/kysely/keyframe-store.js";
import type { KyselyOperationStore } from "../../src/storage/kysely/store.js";
import {
  createCreateDocumentOperation,
  createTestOperationStore,
} from "../factories.js";

const DOC_TYPE = "powerhouse/document-model";
const BRANCH = "main";

function documentOfType(documentType: string): PHDocument {
  const document = documentModelDocumentModelModule.utils.createDocument();
  return { ...document, header: { ...document.header, documentType } };
}

async function finished(
  service: KeyframeCleanupService,
): Promise<KeyframeCleanupRun> {
  await vi.waitFor(
    () => {
      expect(service.status()?.state).not.toBe("running");
    },
    { timeout: 20_000, interval: 10 },
  );
  return service.status()!;
}

describe("KeyframeCleanupService", () => {
  let db: Kysely<Database>;
  let store: KyselyOperationStore;
  let keyframeStore: KyselyKeyframeStore;
  let schema: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await createTestOperationStore();
    db = setup.db as unknown as Kysely<Database>;
    store = setup.store;
    keyframeStore = setup.keyframeStore;
    schema = setup.schema;
    cleanup = setup.cleanup;
  });

  afterEach(async () => {
    try {
      await db.destroy();
    } catch {
      // already destroyed
    }
    await cleanup();
  });

  function serviceWith(
    settings: KeyframeSettings,
    overrides: Partial<
      ConstructorParameters<typeof KeyframeCleanupService>[1]
    > = {},
  ): KeyframeCleanupService {
    return new KeyframeCleanupService(db, {
      schema,
      settings,
      limits: { pauseMs: 0, parkedPollMs: 5 },
      ...overrides,
    });
  }

  async function seedRows(
    documentId: string,
    documentType: string,
    revisions: number[],
    scope = "global",
    branch = BRANCH,
  ): Promise<void> {
    for (const revision of revisions) {
      await keyframeStore.putKeyframe(
        documentId,
        scope,
        branch,
        revision,
        documentOfType(documentType),
      );
    }
  }

  async function markDeleted(documentId: string, documentType: string) {
    const now = new Date().toISOString();
    await db
      .insertInto("WriteIdentity")
      .values({
        documentId,
        branch: BRANCH,
        slug: null,
        documentType,
        isDeleted: true,
        createdAtUtcIso: now,
        updatedAtUtcIso: now,
      })
      .execute();
  }

  async function revisions(documentId: string): Promise<number[]> {
    const rows = await keyframeStore.listKeyframes(documentId);
    return rows.map((row) => row.revision);
  }

  async function allRows(): Promise<number> {
    const rows = await db.selectFrom("Keyframe").select("id").execute();
    return rows.length;
  }

  describe("dry run", () => {
    it("reports rows and bytes per type, per reason and top streams", async () => {
      await seedRows("small", "a/small", [10, 20, 30, 40, 50]);
      await seedRows("large", "a/large", [10, 20, 30, 40]);
      await seedRows("gone", "a/large", [10, 20]);
      await seedRows("all-kept", "a/kept", [10, 20]);
      await markDeleted("gone", "a/large");

      const service = serviceWith({
        default: { keep: 2 },
        types: { "a/small": { keep: 1 }, "a/kept": { keep: null } },
      });
      service.start({ dryRun: true });
      const run = await finished(service);

      expect(run.state).toBe("done");
      expect(run.dryRun).toBe(true);
      expect(run.documentsTotal).toBe(4);
      expect(run.documentsSeen).toBe(4);
      expect(run.totals).toMatchObject({
        streams: 4,
        rows: 13,
        removableRows: 8,
        removedRows: 0,
        removedBytes: 0,
      });
      expect(run.totals.bytes).toBeGreaterThan(0);
      expect(run.totals.removableBytes).toBeGreaterThan(0);

      const byType = Object.fromEntries(
        run.types.map((type) => [type.documentType, type]),
      );
      expect(byType["a/small"]).toMatchObject({
        keep: 1,
        interval: 10,
        streams: 1,
        rows: 5,
        removableRows: 4,
      });
      expect(byType["a/large"]).toMatchObject({
        keep: 2,
        streams: 2,
        rows: 6,
        removableRows: 4,
      });
      expect(byType["a/kept"]).toMatchObject({
        keep: null,
        rows: 2,
        removableRows: 0,
      });

      const byReason = Object.fromEntries(
        run.reasons.map((reason) => [reason.reason, reason]),
      );
      expect(byReason["beyond-keep"]?.rows).toBe(6);
      expect(byReason["deleted-document"]?.rows).toBe(2);

      expect(run.topStreams.map((stream) => stream.documentId)).toContain(
        "gone",
      );
      expect(run.topStreams.map((stream) => stream.documentId)).not.toContain(
        "all-kept",
      );
      expect(run.topStreams[0]!.removableBytes).toBeGreaterThanOrEqual(
        run.topStreams.at(-1)!.removableBytes,
      );
    });

    it("never writes", async () => {
      await seedRows("doc", "a/b", [10, 20, 30]);
      await seedRows("gone", "a/b", [10]);
      await markDeleted("gone", "a/b");

      const kinds: string[] = [];
      const spy: KyselyPlugin = {
        transformQuery: (args) => {
          kinds.push(args.node.kind);
          return args.node;
        },
        transformResult: (args) => Promise.resolve(args.result),
      };

      const service = new KeyframeCleanupService(db.withPlugin(spy), {
        schema,
        settings: { default: { keep: 1 } },
        limits: { pauseMs: 0 },
      });
      service.start({ dryRun: true });
      await finished(service);

      expect(kinds.length).toBeGreaterThan(0);
      expect(new Set(kinds)).toEqual(new Set(["SelectQueryNode"]));
      expect(await allRows()).toBe(4);
    });

    it("predicts exactly what the real run removes", async () => {
      await seedRows("doc", "a/b", [10, 20, 30]);
      await seedRows("gone", "a/b", [10, 20]);
      await markDeleted("gone", "a/b");

      const settings = { default: { keep: 2 } };
      const service = serviceWith(settings);
      service.start({ dryRun: true });
      const preview = await finished(service);

      service.start({ dryRun: false });
      const run = await finished(service);

      expect(run.totals.removedRows).toBe(preview.totals.removableRows);
      expect(run.totals.removedBytes).toBe(preview.totals.removableBytes);
      expect(run.reasons).toEqual(preview.reasons);
    });
  });

  describe("clean-up", () => {
    it("keeps the newest of each stream by the type's rule", async () => {
      await seedRows("doc", "a/b", [10, 20, 30, 40]);
      await seedRows("doc", "a/b", [5, 15, 25], "document");
      await seedRows("doc", "a/b", [10, 20, 30], "global", "draft");
      await seedRows("other", "a/c", [10, 20, 30, 40]);

      const service = serviceWith({
        default: { keep: 2 },
        types: { "a/c": { keep: 1 } },
      });
      service.start({ dryRun: false });
      const run = await finished(service);

      expect(run.state).toBe("done");
      const rows = await keyframeStore.listKeyframes("doc");
      const of = (scope: string, branch: string) =>
        rows
          .filter((row) => row.scope === scope && row.branch === branch)
          .map((row) => row.revision);
      expect(of("global", BRANCH)).toEqual([30, 40]);
      expect(of("document", BRANCH)).toEqual([15, 25]);
      expect(of("global", "draft")).toEqual([20, 30]);
      expect(await revisions("other")).toEqual([40]);
      expect(run.totals.removedRows).toBe(run.totals.removableRows);
    });

    it("removes every keyframe of a deleted document, whatever keep says", async () => {
      await seedRows("gone", "a/b", [10, 20]);
      await seedRows("gone", "a/b", [5], "document");
      await seedRows("live", "a/b", [10, 20]);
      await markDeleted("gone", "a/b");

      const service = serviceWith({});
      service.start({ dryRun: false });
      const run = await finished(service);

      expect(await revisions("gone")).toEqual([]);
      expect(await revisions("live")).toEqual([10, 20]);
      expect(run.reasons).toEqual([
        expect.objectContaining({ reason: "deleted-document", rows: 3 }),
      ]);
    });

    it("spares a branch that is not deleted", async () => {
      await seedRows("doc", "a/b", [10], "global", BRANCH);
      await seedRows("doc", "a/b", [10], "global", "draft");
      await markDeleted("doc", "a/b");

      const service = serviceWith({});
      service.start({ dryRun: false });
      await finished(service);

      const rows = await keyframeStore.listKeyframes("doc");
      expect(rows.map((row) => row.branch)).toEqual(["draft"]);
    });

    it("takes the view's deleted flag for a document the write side never recorded", async () => {
      await seedRows("gone", "a/b", [10]);
      await db
        .insertInto("DocumentSnapshot")
        .values({
          id: "gone",
          documentId: "gone",
          documentType: "a/b",
          scope: "header",
          branch: BRANCH,
          content: "{}",
          lastOperationIndex: 0,
          lastOperationHash: "hash",
          identifiers: null,
          metadata: null,
          isDeleted: true,
          deletedAt: new Date(),
        })
        .execute();

      const service = serviceWith({});
      service.start({ dryRun: false });
      await finished(service);

      expect(await revisions("gone")).toEqual([]);
    });

    it("changes nothing with nothing configured and nothing deleted", async () => {
      await seedRows("doc", "a/b", [10, 20, 30]);

      const service = serviceWith({});
      service.start({ dryRun: false });
      const run = await finished(service);

      expect(run.totals.removableRows).toBe(0);
      expect(await revisions("doc")).toEqual([10, 20, 30]);
    });

    it("is idempotent", async () => {
      await seedRows("doc", "a/b", [10, 20, 30, 40]);
      await seedRows("gone", "a/b", [10]);
      await markDeleted("gone", "a/b");

      const service = serviceWith({ default: { keep: 2 } });
      service.start({ dryRun: false });
      const first = await finished(service);
      expect(first.totals.removedRows).toBe(3);

      service.start({ dryRun: false });
      const second = await finished(service);

      expect(second.state).toBe("done");
      expect(second.totals.removableRows).toBe(0);
      expect(second.totals.removedRows).toBe(0);
      expect(await revisions("doc")).toEqual([30, 40]);
    });

    it("pages across many documents and keeps statements to their limits", async () => {
      const documentCount = 7;
      for (let index = 0; index < documentCount; index++) {
        await seedRows(`doc-${index}`, "a/b", [10, 20, 30, 40, 50]);
      }

      const deletes: number[] = [];
      const spy: KyselyPlugin = {
        transformQuery: (args) => {
          if (args.node.kind === "DeleteQueryNode") deletes.push(1);
          return args.node;
        },
        transformResult: (args) => Promise.resolve(args.result),
      };

      const service = new KeyframeCleanupService(db.withPlugin(spy), {
        schema,
        settings: { default: { keep: 1 } },
        limits: { pauseMs: 0, documentsPerPage: 3, rowsPerStatement: 5 },
      });
      service.start({ dryRun: false });
      const run = await finished(service);

      expect(run.documentsSeen).toBe(documentCount);
      expect(run.totals.removedRows).toBe(4 * documentCount);
      // 12 rows in each full page and 4 in the last, at most 5 per statement.
      expect(deletes).toHaveLength(3 + 3 + 1);
      expect(await allRows()).toBe(documentCount);
    });

    it("splits a statement at the byte limit, but always takes one row", async () => {
      await seedRows("doc", "a/b", [10, 20, 30, 40]);

      let deletes = 0;
      const spy: KyselyPlugin = {
        transformQuery: (args) => {
          if (args.node.kind === "DeleteQueryNode") deletes += 1;
          return args.node;
        },
        transformResult: (args) => Promise.resolve(args.result),
      };

      const service = new KeyframeCleanupService(db.withPlugin(spy), {
        schema,
        settings: { default: { keep: 1 } },
        limits: { pauseMs: 0, bytesPerStatement: 1 },
      });
      service.start({ dryRun: false });
      await finished(service);

      expect(deletes).toBe(3);
      expect(await revisions("doc")).toEqual([40]);
    });
  });

  describe("reads after a clean-up", () => {
    async function seedDocument(
      documentId: string,
      lastGlobalIndex: number,
    ): Promise<void> {
      await store.apply(documentId, DOC_TYPE, "document", BRANCH, 0, (txn) => {
        txn.addOperations(
          createCreateDocumentOperation(
            documentId,
            DOC_TYPE,
            {},
            { protocolVersions: { "base-reducer": 2 } },
          ),
        );
      });
      await store.apply(documentId, DOC_TYPE, "document", BRANCH, 1, (txn) => {
        txn.addOperations({
          id: `${documentId}-document-1`,
          index: 1,
          timestampUtcMs: "2026-01-01T10:00:00.000Z",
          hash: "spine-1",
          skip: 0,
          action: upgradeDocumentAction({
            documentId,
            model: DOC_TYPE,
            fromVersion: 0,
            toVersion: 1,
            initialState: documentModelDocumentModelModule.utils.createState(),
          }) as never,
        });
      });
      for (let index = 0; index <= lastGlobalIndex; index++) {
        await store.apply(
          documentId,
          DOC_TYPE,
          "global",
          BRANCH,
          index,
          (txn) => {
            txn.addOperations({
              id: `${documentId}-global-${index}`,
              index,
              timestampUtcMs: new Date(
                Date.UTC(2026, 0, 1, 11, 0, index),
              ).toISOString(),
              hash: `h${index}`,
              skip: 0,
              action: addModule({
                id: `mod-${index}`,
                name: `m${index}`,
              }) as never,
            });
          },
        );
      }
    }

    it.each([{ keep: 1 }, { keep: 2 }])(
      "keep $keep: every revision reads as a full replay does",
      async ({ keep }) => {
        const registry = new DocumentModelRegistry();
        registry.registerModules(documentModelDocumentModelModule);
        const documentId = generateId();
        await seedDocument(documentId, 45);

        const replay = (): KyselyWriteCache =>
          new KyselyWriteCache(passthroughKeyframeStore, store, registry, {
            maxDocuments: 10,
            ringBufferSize: 30,
            keyframeInterval: Number.MAX_SAFE_INTEGER,
          });

        // The stored keyframes are real folds of the log, written unpruned.
        for (let revision = 10; revision <= 40; revision += 10) {
          const document = await replay().getState(
            documentId,
            "global",
            BRANCH,
            revision,
          );
          await keyframeStore.putKeyframe(
            documentId,
            "global",
            BRANCH,
            revision,
            { ...document, operations: {}, clipboard: [] },
          );
        }

        const service = serviceWith({ default: { keep } });
        service.start({ dryRun: false });
        await finished(service);
        expect(await revisions(documentId)).toHaveLength(keep);

        for (let target = 0; target <= 45; target += 1) {
          const cold = new KyselyWriteCache(keyframeStore, store, registry, {
            maxDocuments: 10,
            ringBufferSize: 30,
            keyframeInterval: 10,
          });
          const read = await cold.getState(
            documentId,
            "global",
            BRANCH,
            target,
          );
          const expected = await replay().getState(
            documentId,
            "global",
            BRANCH,
            target,
          );
          expect(read.state).toEqual(expected.state);
        }
      },
    );
  });

  describe("alongside live writes", () => {
    it("keeps every row a concurrent writer adds", async () => {
      await seedRows("doc", "a/b", [10, 20, 30, 40, 50, 60]);

      const service = serviceWith(
        { default: { keep: 2 } },
        { limits: { pauseMs: 1, rowsPerStatement: 1 } },
      );
      service.start({ dryRun: false });
      for (let revision = 70; revision <= 120; revision += 10) {
        await keyframeStore.putKeyframeAndPrune(
          "doc",
          "global",
          BRANCH,
          revision,
          documentOfType("a/b"),
          2,
        );
      }
      const run = await finished(service);

      expect(run.state).toBe("done");
      expect(await revisions("doc")).toEqual([110, 120]);
    });

    it("counts only what it removed when a writer got there first", async () => {
      await seedRows("doc", "a/b", [10, 20, 30, 40]);

      const service = serviceWith(
        { default: { keep: 1 } },
        { limits: { pauseMs: 30, rowsPerStatement: 1 } },
      );
      service.start({ dryRun: false });
      await keyframeStore.putKeyframeAndPrune(
        "doc",
        "global",
        BRANCH,
        50,
        documentOfType("a/b"),
        1,
      );
      const run = await finished(service);

      expect(run.state).toBe("done");
      expect(run.totals.removedRows).toBeLessThanOrEqual(3);
      expect(await revisions("doc")).toEqual([50]);
    });
  });

  describe("runs", () => {
    it("refuses a second run while one is running", async () => {
      await seedRows("doc", "a/b", [10, 20]);
      const service = serviceWith({ default: { keep: 1 } });

      service.start({ dryRun: true });
      expect(() => service.start({ dryRun: false })).toThrow("already running");
      await finished(service);
    });

    it("answers status before the first run with null", () => {
      expect(serviceWith({}).status()).toBeNull();
      expect(serviceWith({}).reclaimStatus()).toBeNull();
    });

    it("stops after the current statement on cancel and resumes on the next run", async () => {
      for (let index = 0; index < 4; index++) {
        await seedRows(`doc-${index}`, "a/b", [10, 20, 30]);
      }
      const service = serviceWith(
        { default: { keep: 1 } },
        { limits: { pauseMs: 25, rowsPerStatement: 1 } },
      );

      service.start({ dryRun: false });
      await vi.waitFor(() => {
        expect(service.status()?.totals.removedRows).toBeGreaterThan(0);
      });
      service.cancel();
      const cancelled = await finished(service);

      expect(cancelled.state).toBe("cancelled");
      expect(cancelled.finishedAtUtcMs).not.toBeNull();
      expect(await allRows()).toBeGreaterThan(4);

      const resumed = serviceWith({ default: { keep: 1 } });
      resumed.start({ dryRun: false });
      await finished(resumed);
      expect(await allRows()).toBe(4);
    });

    it("reports a failed statement on the run", async () => {
      await seedRows("doc", "a/b", [10, 20]);
      const service = serviceWith({ default: { keep: 1 } });
      const failing: KyselyPlugin = {
        transformQuery: () => {
          throw new Error("store gone");
        },
        transformResult: (args) => Promise.resolve(args.result),
      };
      const broken = new KeyframeCleanupService(db.withPlugin(failing), {
        schema,
        settings: {},
      });

      broken.start({ dryRun: true });
      const run = await finished(broken);

      expect(run.state).toBe("failed");
      expect(run.error).toContain("store gone");
      expect(service.status()).toBeNull();
    });

    it("parks at catch-up level 0 and goes on when the level rises", async () => {
      await seedRows("doc", "a/b", [10, 20]);
      const priority = new CatchUpPriority({ mode: "fixed", level: 0 });
      const service = serviceWith({ default: { keep: 1 } }, { priority });

      service.start({ dryRun: false });
      await vi.waitFor(() => {
        expect(service.status()?.parked).toBe(true);
      });
      expect(await revisions("doc")).toEqual([10, 20]);

      priority.set({ mode: "fixed", level: 4 });
      const run = await finished(service);

      expect(run.state).toBe("done");
      expect(run.parked).toBe(false);
      expect(await revisions("doc")).toEqual([20]);
    });

    it("ends a running run on shutdown", async () => {
      await seedRows("doc", "a/b", [10, 20]);
      const priority = new CatchUpPriority({ mode: "fixed", level: 0 });
      const service = serviceWith({ default: { keep: 1 } }, { priority });

      service.start({ dryRun: false });
      await service.shutdown();

      expect(service.status()?.state).toBe("cancelled");
    });
  });

  describe("reclaim", () => {
    it("says what to do by hand without a maintenance lane", async () => {
      const reclaim = await serviceWith({}).reclaim();

      expect(reclaim.state).toBe("unsupported");
      expect(reclaim.message).toContain('VACUUM FULL reactor."Keyframe"');
      expect(reclaim.message).toContain("pg_repack");
    });

    it("rewrites through the lane and reports the table's sizes", async () => {
      await seedRows("doc", "a/b", [10, 20]);
      const maintenance: IStoreMaintenance = {
        rewriteTable: vi
          .fn()
          .mockResolvedValue({ outcome: "done", durationMs: 7 }),
      };
      const service = serviceWith({}, { maintenance });

      await service.reclaim();
      await vi.waitFor(() => {
        expect(service.reclaimStatus()?.state).toBe("done");
      });

      expect(maintenance.rewriteTable).toHaveBeenCalledExactlyOnceWith({
        schema,
        table: "Keyframe",
        requiredFreeBytes: expect.any(Number) as number,
      });
      const reclaim = service.reclaimStatus()!;
      expect(reclaim.tableBytesBefore).toBeGreaterThan(0);
      expect(reclaim.tableBytesAfter).toBeGreaterThan(0);
      expect(reclaim.durationMs).toBe(7);
    });

    it.each([
      ["busy", "busy"],
      ["refused", "failed"],
    ] as const)("reports a %s store as %s", async (outcome, state) => {
      const maintenance: IStoreMaintenance = {
        rewriteTable: vi.fn().mockResolvedValue({ outcome, reason: "why" }),
      };
      const service = serviceWith({}, { maintenance });

      await service.reclaim();
      await vi.waitFor(() => {
        expect(service.reclaimStatus()?.state).toBe(state);
      });

      expect(service.reclaimStatus()?.message).toBe("why");
    });

    it("refuses while a clean-up runs, and a clean-up while it rewrites", async () => {
      const release: { resolve?: () => void } = {};
      const maintenance: IStoreMaintenance = {
        rewriteTable: () =>
          new Promise((resolve) => {
            release.resolve = () => resolve({ outcome: "done", durationMs: 1 });
          }),
      };
      const service = serviceWith({}, { maintenance });

      service.start({ dryRun: true });
      await expect(service.reclaim()).rejects.toThrow("is running");
      await finished(service);

      await service.reclaim();
      expect(() => service.start({ dryRun: false })).toThrow("being rewritten");

      await vi.waitFor(() => {
        expect(release.resolve).toBeDefined();
      });
      release.resolve!();
      await vi.waitFor(() => {
        expect(service.reclaimStatus()?.state).toBe("done");
      });
    });
  });
});
