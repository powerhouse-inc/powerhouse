import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { addModule } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { JobStatus, type ConsistencyToken } from "../../src/shared/types.js";
import { deletionVerdictsByPosition } from "../../src/decision/deletion-verdicts.js";
import { createDocModelDocument } from "../factories.js";

/**
 * The stage's exit condition: a delete that arrives by sync timestamped in the
 * middle of a document's history refuses the operations that sort after it and
 * leaves the ones before it in effect.
 */
describe("positional deletion", () => {
  let source: IReactor;
  let target: IReactor;

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

      const verdicts = globalOps.global.results.map((op) => ({
        id: (op.action.input as { id?: string }).id,
        denied: op.deniedReason !== undefined,
      }));

      expect(verdicts).toEqual([
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

    const verdicts = await deletionVerdictsByPosition(
      documentId,
      "global",
      "main",
      [
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
      writeCache,
      operationStore,
    );

    expect(verdicts).toEqual([undefined]);
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

    const verdicts = await deletionVerdictsByPosition(
      documentId,
      "document",
      "main",
      [
        op("a", 1, 1, "ADD_RELATIONSHIP"),
        op("b", 2, 5, "DELETE_DOCUMENT"),
        op("c", 3, 9, "ADD_RELATIONSHIP"),
      ],
      writeCache,
      operationStore,
    );

    expect(verdicts).toEqual([undefined, undefined, "document deleted"]);
  });
});
