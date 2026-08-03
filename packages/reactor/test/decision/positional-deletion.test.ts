import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { Operation } from "@powerhousedao/shared/document-model";
import {
  addModule,
  garbageCollect,
  sortOperations,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { JobStatus, type ConsistencyToken } from "../../src/shared/types.js";
import { evaluateDeletionsByPosition } from "../../src/decision/deletion-evaluation.js";
import { documentDecisionModel } from "../../src/decision/document-decision-model.js";
import { createDocModelDocument } from "../factories.js";

/**
 * The stage's exit condition: a delete that arrives by sync timestamped in the
 * middle of a document's history refuses the operations that sort after it and
 * leaves the ones before it in effect.
 */
describe("positional deletion", () => {
  let source: IReactor;
  let target: IReactor;
  let earlierSource: IReactor;

  async function build(documentDecisions: boolean): Promise<IReactor> {
    return new ReactorBuilder()
      .withDocumentModelSources([
        documentModelDocumentModelModule as never,
        driveDocumentModelModule as never,
      ])
      .withExecutorConfig({ featureFlags: { documentDecisions } })
      .build();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    source?.kill();
    target?.kill();
    earlierSource?.kill();
    vi.useRealTimers();
  });

  async function settle(
    reactor: IReactor,
    jobId: string,
  ): Promise<ConsistencyToken> {
    await vi.waitUntil(async () => {
      const status = await reactor.getJobStatus(jobId);
      if (status.status === JobStatus.FAILED) {
        return true;
      }
      return status.status === JobStatus.READ_READY;
    });
    const status = await reactor.getJobStatus(jobId);
    if (status.status === JobStatus.FAILED) {
      throw new Error(status.error?.message ?? "job failed");
    }
    return status.consistencyToken;
  }

  function moduleIds(document: { state: unknown }): string[] {
    const scopes = document.state as Record<
      string,
      { specifications?: { modules?: { id: string }[] }[] }
    >;
    return (scopes.global.specifications?.[0]?.modules ?? []).map((m) => m.id);
  }

  it.each([false, true])(
    "denies only the loaded operations that sort after a delete (flag %s)",
    async (documentDecisions) => {
      source = await build(documentDecisions);
      target = await build(documentDecisions);

      const document = createDocModelDocument({ id: "positional-doc" });
      const created = await source.create(document);
      const createToken = await settle(source, created.id);
      const docId = document.header.id;

      const createOps = await source.getOperations(
        docId,
        { branch: "main", scopes: ["document"] },
        undefined,
        undefined,
        createToken,
      );
      const loadCreate = await target.load(
        docId,
        "main",
        createOps.document.results,
      );
      await settle(target, loadCreate.id);

      // The source writes one operation early and one late.
      const early = await source.execute(docId, "main", [
        addModule({ id: "early", name: "early" }),
      ]);
      const earlyToken = await settle(source, early.id);
      vi.advanceTimersByTime(10_000);
      const late = await source.execute(docId, "main", [
        addModule({ id: "late", name: "late" }),
      ]);
      const lateToken = await settle(source, late.id);

      // The target deletes the document between the two timestamps.
      vi.setSystemTime(new Date("2026-01-01T00:00:05.000Z"));
      const deleteJob = await target.deleteDocument(docId);
      await settle(target, deleteJob.id);

      // Both of the source's operations now arrive.
      const globalFromSource = await source.getOperations(
        docId,
        { branch: "main", scopes: ["global"] },
        undefined,
        undefined,
        lateToken ?? earlyToken,
      );
      const loadGlobal = await target.load(
        docId,
        "main",
        globalFromSource.global.results,
      );

      if (!documentDecisions) {
        // Today the whole load is refused, because the document is deleted.
        await expect(settle(target, loadGlobal.id)).rejects.toThrow(/deleted/i);
        return;
      }

      await settle(target, loadGlobal.id);
      const globalOps = await target.getOperations(docId, {
        branch: "main",
        scopes: ["global"],
      });

      const evaluations = globalOps.global.results.map((op) => ({
        id: (op.action.input as { id?: string }).id,
        denied: op.deniedReason !== undefined,
      }));

      expect(evaluations).toEqual([
        { id: "early", denied: false },
        { id: "late", denied: true },
      ]);
    },
  );

  it("reads only deletions from the document scope, and stops when there are none", async () => {
    const documentId = "counted-doc";
    const reads: Array<{ scope: string; actionTypes?: string[] }> = [];

    const operationStore = {
      getSince: (
        _documentId: string,
        scope: string,
        _branch: string,
        _revision: number,
        filter?: { actionTypes?: string[] },
      ) => {
        reads.push({ scope, actionTypes: filter?.actionTypes });
        return Promise.resolve({
          results: [],
          options: {},
          nextCursor: undefined,
        });
      },
    } as never;

    const writeCache = {
      getState: () => {
        throw new Error("must not read state when nothing can be refused");
      },
    } as never;

    const evaluations = await evaluateDeletionsByPosition(
      documentDecisionModel,
      { documentId, branch: "main" },
      {
        scope: "global",
        operations: [
          {
            id: "op-1",
            index: 0,
            skip: 0,
            hash: "h",
            timestampUtcMs: "2026-01-01T00:00:00.000Z",
            action: {
              id: "a-1",
              type: "ADD_MODULE",
              scope: "global",
              timestampUtcMs: "2026-01-01T00:00:00.000Z",
              input: {},
            },
          } as never,
        ],
      },
      { writeCache, operationStore },
    );

    expect(evaluations).toEqual([undefined]);
    expect(reads).toEqual([
      { scope: "document", actionTypes: ["DELETE_DOCUMENT"] },
    ]);
  });

  it("refuses the rest of a batch after a deletion inside it", async () => {
    const documentId = "batch-doc";

    const operationStore = {
      getSince: () =>
        Promise.resolve({ results: [], options: {}, nextCursor: undefined }),
    } as never;

    const writeCache = {
      getState: () =>
        Promise.resolve({
          header: { id: documentId, documentType: "t" },
          state: { document: {}, global: {} },
          operations: {},
          clipboard: [],
          initialState: {},
        }),
    } as never;

    const op = (id: string, index: number, seconds: number, type: string) =>
      ({
        id: `op-${id}`,
        index,
        skip: 0,
        hash: "h",
        timestampUtcMs: new Date(
          Date.UTC(2026, 0, 1, 0, 0, seconds),
        ).toISOString(),
        action: {
          id,
          type,
          scope: "document",
          timestampUtcMs: new Date(
            Date.UTC(2026, 0, 1, 0, 0, seconds),
          ).toISOString(),
          input: { documentId },
        },
      }) as never;

    const evaluations = await evaluateDeletionsByPosition(
      documentDecisionModel,
      { documentId, branch: "main" },
      {
        scope: "document",
        operations: [
          op("a", 1, 1, "ADD_RELATIONSHIP"),
          op("b", 2, 5, "DELETE_DOCUMENT"),
          op("c", 3, 9, "ADD_RELATIONSHIP"),
        ],
      },
      { writeCache, operationStore },
    );

    expect(evaluations).toEqual([undefined, undefined, "document deleted"]);
  });

  it.each([false, true])(
    "re-evaluates committed operations when a delete arrives late (flag %s)",
    async (documentDecisions) => {
      source = await build(documentDecisions);
      target = await build(documentDecisions);

      const document = createDocModelDocument({ id: "late-delete-doc" });
      const created = await source.create(document);
      const createToken = await settle(source, created.id);
      const docId = document.header.id;

      const createOps = await source.getOperations(
        docId,
        { branch: "main", scopes: ["document"] },
        undefined,
        undefined,
        createToken,
      );
      const loadCreate = await target.load(
        docId,
        "main",
        createOps.document.results,
      );
      await settle(target, loadCreate.id);

      // The source deletes early, and does not tell the target yet.
      vi.advanceTimersByTime(1000);
      const deleteJob = await source.deleteDocument(docId);
      const deleteToken = await settle(source, deleteJob.id);

      // The target writes one operation before that timestamp and one after.
      vi.setSystemTime(new Date("2026-01-01T00:00:00.500Z"));
      const beforeJob = await target.execute(docId, "main", [
        addModule({ id: "before", name: "before" }),
      ]);
      await settle(target, beforeJob.id);

      vi.setSystemTime(new Date("2026-01-01T00:00:20.000Z"));
      const afterJob = await target.execute(docId, "main", [
        addModule({ id: "after", name: "after" }),
      ]);
      await settle(target, afterJob.id);

      // Now the delete arrives.
      const deleteOps = await source.getOperations(
        docId,
        { branch: "main", scopes: ["document"] },
        undefined,
        undefined,
        deleteToken,
      );
      const loadDelete = await target.load(
        docId,
        "main",
        deleteOps.document.results.filter(
          (op) => op.action.type === "DELETE_DOCUMENT",
        ),
      );
      await settle(target, loadDelete.id);

      const globalOps = await target.getOperations(docId, {
        branch: "main",
        scopes: ["global"],
      });

      // The stored rows keep the superseded copy; the effective stream is what
      // a rebuild sees.
      const effective = garbageCollect(
        sortOperations([...globalOps.global.results]),
      ).map((op) => ({
        id: (op.action.input as { id?: string }).id,
        denied: op.deniedReason !== undefined,
      }));

      if (!documentDecisions) {
        // Without positional evaluation a delete says nothing about operations
        // already committed, whenever they were timestamped.
        expect(effective).toEqual([
          { id: "before", denied: false },
          { id: "after", denied: false },
        ]);
        return;
      }

      expect(effective).toEqual([
        { id: "before", denied: false },
        { id: "after", denied: true },
      ]);
    },
  );

  /**
   * A second delete, timestamped earlier still, has to retract a tail whose
   * indices already have a gap in them, so the skip it carries has to span the
   * distance rather than count the operations.
   */
  it("retracts a tail across the gap an earlier pass left", async () => {
    source = await build(true);
    earlierSource = await build(true);
    target = await build(true);

    const document = createDocModelDocument({ id: "gap-retraction-doc" });
    const created = await source.create(document);
    const createToken = await settle(source, created.id);
    const docId = document.header.id;

    const createOps = await source.getOperations(
      docId,
      { branch: "main", scopes: ["document"] },
      undefined,
      undefined,
      createToken,
    );
    for (const replica of [earlierSource, target]) {
      const load = await replica.load(
        docId,
        "main",
        createOps.document.results,
      );
      await settle(replica, load.id);
    }

    async function deleteOperations(
      replica: IReactor,
      at: string,
    ): Promise<Operation[]> {
      vi.setSystemTime(new Date(at));
      const job = await replica.deleteDocument(docId);
      const token = await settle(replica, job.id);
      const ops = await replica.getOperations(
        docId,
        { branch: "main", scopes: ["document"] },
        undefined,
        undefined,
        token,
      );
      return ops.document.results.filter(
        (op) => op.action.type === "DELETE_DOCUMENT",
      );
    }

    const earlierDelete = await deleteOperations(
      earlierSource,
      "2026-01-01T00:00:00.200Z",
    );
    const laterDelete = await deleteOperations(
      source,
      "2026-01-01T00:00:01.000Z",
    );

    // The target writes on either side of the later delete.
    vi.setSystemTime(new Date("2026-01-01T00:00:00.500Z"));
    const beforeJob = await target.execute(docId, "main", [
      addModule({ id: "before", name: "before" }),
    ]);
    await settle(target, beforeJob.id);

    vi.setSystemTime(new Date("2026-01-01T00:00:20.000Z"));
    const afterJob = await target.execute(docId, "main", [
      addModule({ id: "after", name: "after" }),
    ]);
    await settle(target, afterJob.id);

    // The later delete refuses only "after", leaving its superseded copy at an
    // index the effective stream no longer visits.
    const loadLater = await target.load(docId, "main", laterDelete);
    await settle(target, loadLater.id);

    const afterFirstPass = await target.getOperations(docId, {
      branch: "main",
      scopes: ["global"],
    });
    expect(
      garbageCollect(sortOperations([...afterFirstPass.global.results])).map(
        (op) => op.index,
      ),
    ).toEqual([0, 2]);

    // The earlier delete now refuses both, so the retraction starts at index 0
    // and has to reach across the gap at index 1.
    const loadEarlier = await target.load(docId, "main", earlierDelete);
    await settle(target, loadEarlier.id);

    const stored = (
      await target.getOperations(docId, { branch: "main", scopes: ["global"] })
    ).global.results;

    // Counting the retracted operations instead of spanning the distance would
    // leave "before" standing beside its own replacement, applying it twice.
    expect(
      garbageCollect(sortOperations([...stored])).map((op) => ({
        id: (op.action.input as { id?: string }).id,
        denied: op.deniedReason !== undefined,
      })),
    ).toEqual([
      { id: "before", denied: true },
      { id: "after", denied: true },
    ]);

    // Two operations were retracted, but they spanned three indices.
    expect(stored.find((op) => op.skip > 1)!.skip).toBe(3);

    // The reshuffle put the earlier delete first, which refuses the later one,
    // and the copy the reshuffle replaced is no longer in effect.
    const docScope = (
      await target.getOperations(docId, {
        branch: "main",
        scopes: ["document"],
      })
    ).document.results;

    expect(
      garbageCollect(sortOperations([...docScope])).map((op) => ({
        type: op.action.type,
        denied: op.deniedReason !== undefined,
      })),
    ).toEqual([
      { type: "CREATE_DOCUMENT", denied: false },
      { type: "UPGRADE_DOCUMENT", denied: false },
      { type: "DELETE_DOCUMENT", denied: false },
      { type: "DELETE_DOCUMENT", denied: true },
    ]);
  });

  /**
   * The caller supplies the timestamp and the reactor does not re-stamp it, so a
   * locally executed delete can land below operations already stored. Without a
   * pass here, the reactor issuing the delete would be the only replica keeping
   * its own later operations in effect.
   */
  it.each([false, true])(
    "re-evaluates after a local delete that sorts backwards (flag %s)",
    async (documentDecisions) => {
      target = await build(documentDecisions);

      const document = createDocModelDocument({ id: "local-backdate-doc" });
      const created = await target.create(document);
      await settle(target, created.id);
      const docId = document.header.id;

      vi.setSystemTime(new Date("2026-01-01T00:00:00.500Z"));
      const beforeJob = await target.execute(docId, "main", [
        addModule({ id: "before", name: "before" }),
      ]);
      await settle(target, beforeJob.id);

      vi.setSystemTime(new Date("2026-01-01T00:00:20.000Z"));
      const afterJob = await target.execute(docId, "main", [
        addModule({ id: "after", name: "after" }),
      ]);
      await settle(target, afterJob.id);

      vi.setSystemTime(new Date("2026-01-01T00:00:01.000Z"));
      const deleteJob = await target.deleteDocument(docId);
      await settle(target, deleteJob.id);

      const stored = (
        await target.getOperations(docId, {
          branch: "main",
          scopes: ["global"],
        })
      ).global.results;

      const effective = garbageCollect(sortOperations([...stored])).map(
        (op) => ({
          id: (op.action.input as { id?: string }).id,
          denied: op.deniedReason !== undefined,
        }),
      );

      if (!documentDecisions) {
        // Without positional evaluation a delete says nothing about operations
        // already committed.
        expect(effective).toEqual([
          { id: "before", denied: false },
          { id: "after", denied: false },
        ]);
        return;
      }

      expect(effective).toEqual([
        { id: "before", denied: false },
        { id: "after", denied: true },
      ]);
    },
  );
});
